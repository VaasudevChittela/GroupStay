import { supabase } from './supabase';
import { Gender } from './types';

export function roomTypeForCapacity(capacity: number) {
  if (capacity === 1) return 'Single';
  if (capacity === 2) return 'Double';
  if (capacity === 3) return 'Triple';
  if (capacity === 4) return 'Quad';
  return `${capacity}-person`;
}

export function sameText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

type RoomPerson = { school: string; gender: Gender | null; is_chaperone?: boolean };

// Students may only use rooms for their own school and gender. A room with no gender
// designation takes on the gender of whoever is already in it. When the trip keeps
// chaperones separate, a room holds only chaperones or only students.
export function canUseRoom(
  guest: RoomPerson,
  room: { school: string; gender: Gender | null },
  occupants: Array<{ gender: Gender | null; is_chaperone?: boolean }>,
  separateChaperones = false,
) {
  if (!sameText(guest.school, room.school)) return false;
  if (room.gender && room.gender !== guest.gender) return false;
  if (!room.gender && occupants.some((o) => o.gender && guest.gender && o.gender !== guest.gender)) return false;
  if (separateChaperones && occupants.some((o) => Boolean(o.is_chaperone) !== Boolean(guest.is_chaperone))) return false;
  return true;
}

export async function isTripLocked(tripId: number) {
  const { data } = await supabase.from('trips').select('locked_at, lock_deadline').eq('id', tripId).maybeSingle();
  if (data?.locked_at) return true;
  if (data?.lock_deadline && new Date(data.lock_deadline).getTime() <= Date.now()) {
    await applyLockDeadline(tripId);
    return true;
  }
  return false;
}

// If the trip's lock deadline has passed, lock it and send the manifest (the server does the
// work so any participant's app can trigger it). Returns true if it locked the trip just now.
export async function applyLockDeadline(tripId: number) {
  const { data } = await supabase.rpc('apply_lock_deadline', { p_trip_id: tripId });
  return Boolean(data);
}
