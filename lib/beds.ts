import { supabase } from './supabase';
import { notify } from './notify';

export type BedCount = { people: number; beds: number; short: number };

// People = whichever is bigger: the planned headcount or who has actually joined.
export async function getBedCount(tripId: number): Promise<BedCount> {
  const [{ data: trip }, { data: rooms }, { data: guests }] = await Promise.all([
    supabase.from('trips').select('headcount').eq('id', tripId).maybeSingle(),
    supabase.from('rooms').select('capacity').eq('trip_id', tripId),
    supabase.from('guests').select('id').eq('trip_id', tripId),
  ]);
  const people = Math.max(trip?.headcount ?? 0, guests?.length ?? 0);
  const beds = (rooms ?? []).reduce((sum, room) => sum + room.capacity, 0);
  return { people, beds, short: Math.max(0, people - beds) };
}

// Warns the hotel when a group needs more beds than it has. Only warns again if the shortfall
// grows, and stays quiet until the hotel has started adding rooms (the "new trip" notice covers that).
export async function checkBedCount(tripId: number) {
  const [{ people, beds, short }, { data: trip }] = await Promise.all([
    getBedCount(tripId),
    supabase.from('trips').select('name, school, beds_short_notified').eq('id', tripId).maybeSingle(),
  ]);
  if (!trip) return;
  const already = trip.beds_short_notified ?? 0;
  if (short > already && beds > 0) {
    await notify(
      tripId,
      'staff',
      'More beds needed',
      `${trip.school ?? trip.name} needs ${short} more bed${short === 1 ? '' : 's'}: ${people} people, ${beds} beds so far.`,
      null,
      'manifest',
    );
    await notify(tripId, 'advisor', 'Not enough beds yet', `The hotel has ${beds} beds for ${people} people (${short} short). They've been notified.`, null, 'roster');
  }
  if (short !== already) {
    await supabase.from('trips').update({ beds_short_notified: short }).eq('id', tripId);
  }
}
