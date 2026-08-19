import { supabase } from './supabase';
import { DEMO_WRITE_MESSAGE, isDemoMode } from './demo';

/**
 * The permanent record of who moved whom, when, and why.
 *
 * Rows are written by a database trigger rather than from here, so an entry
 * cannot be missed by a code path that forgot to log — including bulk
 * auto-assign and anything run straight from the SQL editor. This module reads
 * that history and supplies the reason the trigger picks up.
 */

export type AssignmentAction =
  | 'assigned'
  | 'moved'
  | 'unassigned'
  | 'checked_in'
  | 'checked_out'
  | 'key_issued'
  | 'key_moved'
  | 'key_revoked'
  | 'key_expired';

export type AssignmentEvent = {
  id: string;
  trip_id: string;
  guest_id: string;
  from_room_id: string | null;
  to_room_id: string | null;
  action: AssignmentAction;
  reason: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

export const ACTION_LABEL: Record<AssignmentAction, string> = {
  assigned: 'Assigned',
  moved: 'Moved',
  unassigned: 'Removed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  key_issued: 'Digital key issued',
  key_moved: 'Digital key moved',
  key_revoked: 'Digital key revoked',
  key_expired: 'Digital key expired',
};

export const ACTOR_LABEL: Record<string, string> = {
  hotel_staff: 'Hotel Staff',
  chapter_assignor: 'Chapter Assignor',
  student: 'Student',
  admin: 'Administrator',
};

const err = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);

const COLUMNS =
  'id, trip_id, guest_id, from_room_id, to_room_id, action, reason, actor_name, actor_role, created_at';

/** Everything that ever happened in one room, newest first. */
export async function loadRoomHistory(roomId: string, limit = 100): Promise<AssignmentEvent[]> {
  if (isDemoMode()) return demoRoomHistory(roomId);

  const { data } = await supabase
    .from('assignment_events')
    .select(COLUMNS)
    .or(`to_room_id.eq.${roomId},from_room_id.eq.${roomId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AssignmentEvent[];
}

/** One guest's assignment trail, for the guest detail view. */
export async function loadGuestHistory(guestId: string, limit = 50): Promise<AssignmentEvent[]> {
  if (isDemoMode()) return [];

  const { data } = await supabase
    .from('assignment_events')
    .select(COLUMNS)
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AssignmentEvent[];
}

/**
 * Attach a reason to the next assignment write in this transaction. The
 * trigger reads it back out, so the reason lands on the history row without
 * every assignment function needing an extra parameter.
 */
export async function withReason(reason: string | null): Promise<void> {
  if (isDemoMode() || !reason?.trim()) return;
  await supabase.rpc('set_change_reason', { p_reason: reason.trim() });
}

/** Put a guest back in the room they were moved out of. */
export async function restoreAssignment(
  guestId: string,
  reason = 'Restored previous assignment',
): Promise<{ roomId: string | null; error: string | null }> {
  if (isDemoMode()) return { roomId: null, error: DEMO_WRITE_MESSAGE };

  const { data, error } = await supabase.rpc('restore_assignment', {
    p_guest: guestId,
    p_reason: reason,
  });
  if (error) return { roomId: null, error: err(error) };
  return { roomId: (data as string) ?? null, error: null };
}

/** Can this guest be put back somewhere? */
export function previousRoomFor(events: AssignmentEvent[], guestId: string): string | null {
  const move = events.find(
    (e) => e.guest_id === guestId && (e.action === 'moved' || e.action === 'unassigned') && e.from_room_id,
  );
  return move?.from_room_id ?? null;
}

export const formatEventTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Sample history, so the timeline is populated without a backend.
// ---------------------------------------------------------------------------
function demoRoomHistory(roomId: string): AssignmentEvent[] {
  const base = new Date();
  base.setHours(14, 14, 0, 0);
  const at = (minutes: number) => new Date(base.getTime() + minutes * 60000).toISOString();

  const seed: Record<string, Array<Partial<AssignmentEvent> & { action: AssignmentAction; minutes: number }>> = {
    r1: [
      { action: 'assigned', guest_id: 'g1', minutes: 0, actor_role: 'chapter_assignor', actor_name: 'Ms. Reyes' },
      { action: 'assigned', guest_id: 'g2', minutes: 4, actor_role: 'chapter_assignor', actor_name: 'Ms. Reyes' },
      { action: 'checked_in', guest_id: 'g1', minutes: 46, actor_role: 'hotel_staff', actor_name: 'Front Desk' },
      { action: 'key_issued', guest_id: 'g1', minutes: 46, actor_role: 'hotel_staff', actor_name: 'Front Desk' },
      { action: 'checked_in', guest_id: 'g2', minutes: 48, actor_role: 'hotel_staff', actor_name: 'Front Desk' },
    ],
    r5: [
      {
        action: 'moved',
        guest_id: 'g9',
        minutes: 48,
        actor_role: 'chapter_assignor',
        actor_name: 'Ms. Reyes',
        reason: 'Roommate change',
        from_room_id: 'r4',
      },
      { action: 'key_moved', guest_id: 'g9', minutes: 49, actor_role: 'chapter_assignor', actor_name: 'Ms. Reyes' },
      { action: 'assigned', guest_id: 'g11', minutes: 10, actor_role: 'chapter_assignor', actor_name: 'Ms. Reyes' },
    ],
  };

  return (seed[roomId] ?? []).map((e, index) => ({
    id: `${roomId}-h${index}`,
    trip_id: 'demo-trip',
    guest_id: e.guest_id ?? 'g1',
    from_room_id: e.from_room_id ?? null,
    to_room_id: roomId,
    action: e.action,
    reason: e.reason ?? null,
    actor_name: e.actor_name ?? null,
    actor_role: e.actor_role ?? null,
    created_at: at(e.minutes),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
