import { supabase } from './supabase';
import { RoomHistoryEntry } from './types';

type Change = {
  guest: { id: number; legal_name: string };
  action: RoomHistoryEntry['action'];
  fromRoom?: string | null;
  toRoom?: string | null;
};

// Records who moved where, so advisors can settle "I never left that room" questions later.
export async function logRoomChanges(tripId: number, changedBy: string, changes: Change[]) {
  if (changes.length === 0) return;
  await supabase.from('room_history').insert(
    changes.map((c) => ({
      trip_id: tripId,
      guest_id: c.guest.id,
      guest_name: c.guest.legal_name,
      action: c.action,
      from_room: c.fromRoom ?? null,
      to_room: c.toRoom ?? null,
      changed_by: changedBy,
    })),
  );
}
