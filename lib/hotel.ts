import { supabase } from './supabase';
import {
  DigitalKey,
  GuestRequest,
  GuestRequestType,
  HotelGuest,
  HotelRoom,
  Reservation,
  RoomStatus,
  RoomWithOccupancy,
  TripSummary,
} from './hotelTypes';
import { expireKeysForReservation, issueKey, moveKeysToRoom } from './keys';
import { checkoutExpiry } from './dates';
import {
  Guest as AutoGuest,
  Room as AutoRoom,
  autoAssignGuests,
} from './assignments';
import { DEMO_TRIP, DEMO_WRITE_MESSAGE, demoSnapshot, isDemoMode } from './demo';
import { notify } from './notifications';

type Result<T> = { data: T; error: null } | { data: null; error: string };

const err = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);

const normalizeRoom = (row: any): HotelRoom => ({
  ...row,
  status: row.status ?? 'available',
  max_guests: row.max_guests ?? row.capacity ?? null,
  photos: Array.isArray(row.photos) ? row.photos : [],
});

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export type RoomInput = {
  room_number: string;
  room_type: string;
  capacity: number;
  max_guests: number;
  school?: string | null;
  notes?: string | null;
  photos?: string[];
  floor?: string | null;
  status?: RoomStatus;
};

export async function createRoom(tripId: string, input: RoomInput): Promise<Result<HotelRoom>> {
  if (isDemoMode()) return { data: null, error: DEMO_WRITE_MESSAGE };
  const { data, error } = await supabase
    .from('rooms')
    .insert([{ trip_id: tripId, school: '', ...input }])
    .select('*')
    .single();
  if (error || !data) return { data: null, error: err(error ?? 'Unable to add room') };
  return { data: normalizeRoom(data), error: null };
}

export async function updateRoom(roomId: string, patch: Partial<RoomInput> & { housekeeping_note?: string | null }): Promise<Result<HotelRoom>> {
  if (isDemoMode()) return { data: null, error: DEMO_WRITE_MESSAGE };
  const { data, error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', roomId)
    .select('*')
    .single();
  if (error || !data) return { data: null, error: err(error ?? 'Unable to update room') };
  return { data: normalizeRoom(data), error: null };
}

export async function setRoomStatus(roomId: string, status: RoomStatus): Promise<Result<HotelRoom>> {
  const result = await updateRoom(roomId, { status });

  // Housekeeping finishing a turnover is worth telling the incoming guest.
  if (result.data && status === 'available') {
    const { data: waiting } = await supabase
      .from('assignments')
      .select('guest_id, trip_id')
      .eq('room_id', roomId)
      .eq('status', 'reserved');

    await Promise.all(
      (waiting ?? []).map((row: any) =>
        notify({
          type: 'room_ready',
          tripId: row.trip_id,
          guestId: row.guest_id,
          roomId,
          context: { roomNumber: result.data?.room_number },
        }),
      ),
    );
  }
  return result;
}

export async function deleteRoom(roomId: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  return error ? err(error) : null;
}

// ---------------------------------------------------------------------------
// Full dashboard load: rooms + reservations + guests + keys in one shot
// ---------------------------------------------------------------------------

export type HotelSnapshot = {
  rooms: RoomWithOccupancy[];
  guests: HotelGuest[];
  reservations: Reservation[];
  keys: DigitalKey[];
  requests: GuestRequest[];
  /** True when 0001_hotel_platform.sql hasn't been applied to this project yet. */
  migrationPending: boolean;
};

/** PostgREST reports a table that doesn't exist yet with PGRST205. */
const isMissingTable = (error: any) => error?.code === 'PGRST205';

/**
 * Trips visible to the signed-in user. Row level security already limits this
 * to their hotel or their chapter, so no client-side filter is needed — but we
 * pass the scope explicitly too, so a bug here can only ever narrow the result.
 */
export async function loadScopedTrips(scope: {
  hotelId?: string | null;
  chapterId?: string | null;
}): Promise<Result<TripSummary[]>> {
  if (isDemoMode()) return { data: [DEMO_TRIP], error: null };

  let query = supabase.from('trips').select('id, name, hotel_name, trip_code').order('name');
  if (scope.hotelId) query = query.eq('hotel_id', scope.hotelId);
  if (scope.chapterId) query = query.eq('chapter_id', scope.chapterId);

  const { data, error } = await query;
  if (error) return { data: null, error: err(error) };
  return { data: (data ?? []) as TripSummary[], error: null };
}

export async function loadHotelSnapshot(tripId: string): Promise<Result<HotelSnapshot>> {
  return loadSnapshotForTrips([tripId]);
}

/** Same dashboard payload, but spanning every group staying at the property. */
export async function loadSnapshotForTrips(tripIds: string[]): Promise<Result<HotelSnapshot>> {
  if (isDemoMode()) return { data: demoSnapshot(), error: null };

  if (tripIds.length === 0) {
    return {
      data: { rooms: [], guests: [], reservations: [], keys: [], requests: [], migrationPending: false },
      error: null,
    };
  }

  const [roomsRes, guestsRes, reservationsRes, keysRes, requestsRes] = await Promise.all([
    supabase.from('rooms').select('*').in('trip_id', tripIds).order('room_number'),
    supabase.from('guests').select('id, legal_name, email, phone, school, arrival_window, is_chaperone').in('trip_id', tripIds).order('legal_name'),
    supabase.from('assignments').select('*').in('trip_id', tripIds),
    supabase.from('digital_keys').select('*').in('trip_id', tripIds),
    supabase.from('guest_requests').select('*').in('trip_id', tripIds).neq('status', 'resolved').order('created_at', { ascending: false }),
  ]);

  // Rooms and guests are pre-existing tables — a failure there is a real error.
  const coreError = roomsRes.error || guestsRes.error || reservationsRes.error;
  if (coreError) return { data: null, error: err(coreError) };

  // Keys and requests come from this feature's migration. If it hasn't been run
  // yet the dashboard still works; it just shows a setup banner.
  const migrationPending = isMissingTable(keysRes.error) || isMissingTable(requestsRes.error);
  const nonMigrationError =
    (keysRes.error && !isMissingTable(keysRes.error)) || (requestsRes.error && !isMissingTable(requestsRes.error));
  if (nonMigrationError) return { data: null, error: err(keysRes.error ?? requestsRes.error) };

  const guests = (guestsRes.data ?? []) as HotelGuest[];
  const reservations = (reservationsRes.data ?? []).map((r: any): Reservation => ({
    ...r,
    status: r.status ?? 'reserved',
  }));
  const keys = (keysRes.data ?? []) as DigitalKey[];
  const guestById = new Map(guests.map((g) => [g.id, g]));

  const rooms: RoomWithOccupancy[] = (roomsRes.data ?? []).map((row: any) => {
    const room = normalizeRoom(row);
    const roomReservations = reservations
      .filter((r) => r.room_id === room.id && r.status !== 'cancelled' && r.status !== 'checked_out')
      .map((r) => ({ ...r, guest: guestById.get(r.guest_id) ?? null }));
    const activeKeyCount = keys.filter((k) => k.room_id === room.id && k.status === 'active').length;
    return { ...room, reservations: roomReservations, activeKeyCount };
  });

  return {
    data: {
      rooms,
      guests,
      reservations,
      keys,
      requests: (requestsRes.data ?? []) as GuestRequest[],
      migrationPending,
    },
    error: null,
  };
}

/**
 * Rooms whose stored status disagrees with live occupancy get a derived status:
 * occupied when anyone is checked in, reserved when assigned but not yet in.
 * Manual states (cleaning / maintenance / out_of_service) always win.
 */
export function deriveRoomStatus(room: RoomWithOccupancy): RoomStatus {
  if (room.status === 'cleaning' || room.status === 'maintenance' || room.status === 'out_of_service') {
    return room.status;
  }
  if (room.reservations.some((r) => r.status === 'checked_in')) return 'occupied';
  if (room.reservations.length > 0) return 'reserved';
  return 'available';
}

// ---------------------------------------------------------------------------
// Reservations / assignment operations
// ---------------------------------------------------------------------------

const makeConfirmation = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'GS-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export async function assignGuestToRoom(
  tripId: string,
  guestId: string,
  roomId: string,
  dates?: { check_in?: string | null; check_out?: string | null },
): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;

  const { data: existing } = await supabase
    .from('assignments')
    .select('id, status, confirmation_code, room_id')
    .eq('guest_id', guestId)
    .maybeSingle();

  const payload = {
    trip_id: tripId,
    guest_id: guestId,
    room_id: roomId,
    status: existing?.status === 'checked_in' ? 'checked_in' : 'reserved',
    confirmation_code: existing?.confirmation_code ?? makeConfirmation(),
    ...(dates ?? {}),
  };

  const { error } = await supabase
    .from('assignments')
    .upsert([payload], { onConflict: 'guest_id' });
  if (error) return err(error);

  // If the guest is already checked in and just moved, re-point their keys.
  if (existing?.status === 'checked_in') {
    await moveKeysToRoom(guestId, roomId);
  }

  const roomNumber = await lookupRoomNumber(roomId);
  await notify({
    type: existing?.room_id && existing.room_id !== roomId ? 'room_changed' : 'room_assigned',
    tripId,
    guestId,
    roomId,
    context: { roomNumber },
  });
  return null;
}

/** Room numbers read better than ids in a notification. */
async function lookupRoomNumber(roomId: string | null): Promise<string | null> {
  if (!roomId) return null;
  const { data } = await supabase.from('rooms').select('room_number').eq('id', roomId).maybeSingle();
  return (data?.room_number as string) ?? null;
}

/**
 * Bulk room assignment using the original GroupStay algorithm: chaperones get
 * spread across rooms first, mutual roommate requests are honoured next, then
 * everyone else fills the smallest room that still fits them. Only touches
 * guests who don't already have a room.
 */
export async function autoAssignRooms(
  tripIds: string[],
  snapshot: HotelSnapshot,
): Promise<Result<{ assigned: number; unassigned: number }>> {
  if (isDemoMode()) return { data: null, error: DEMO_WRITE_MESSAGE };

  const alreadyPlaced = new Set(
    snapshot.reservations.filter((r) => r.room_id && r.status !== 'cancelled').map((r) => r.guest_id),
  );

  // Roommate requests are optional — older projects may not have the column,
  // so a failure here just means pairing is skipped.
  const { data: requestRows } = await supabase
    .from('guests')
    .select('id, roommate_request_id')
    .in('trip_id', tripIds);
  const requestById = new Map<string, string | null>(
    (requestRows ?? []).map((r: any) => [r.id, r.roommate_request_id ?? null]),
  );

  const guests: AutoGuest[] = snapshot.guests
    .filter((g) => !alreadyPlaced.has(g.id))
    .map((g) => ({
      id: g.id,
      school: g.school ?? '',
      is_chaperone: g.is_chaperone,
      roommate_request_id: requestById.get(g.id) ?? null,
    }));

  if (guests.length === 0) return { data: { assigned: 0, unassigned: 0 }, error: null };

  // Remaining space per room, so auto-assign tops up partly-filled rooms.
  const rooms: AutoRoom[] = snapshot.rooms.map((room) => ({
    id: room.id,
    capacity: Math.max((room.max_guests ?? room.capacity) - room.reservations.length, 0),
    school: room.school ?? '',
  }));

  // The original algorithm matches rooms to guests by school. Blocks that were
  // set up without a school would never match, so treat those as open to all.
  const schoolsInUse = new Set(rooms.map((r) => r.school).filter(Boolean));
  const openRooms = rooms.map((room) =>
    room.school || schoolsInUse.size === 0 ? room : { ...room, school: '' },
  );
  const normalizedGuests = schoolsInUse.size === 0 ? guests.map((g) => ({ ...g, school: '' })) : guests;

  const { assignments, unassignedGuestIds } = autoAssignGuests(normalizedGuests, openRooms);
  if (assignments.length === 0) {
    return { data: { assigned: 0, unassigned: unassignedGuestIds.length }, error: null };
  }

  // The room decides the trip: an unassigned guest has no reservation row to
  // read a trip_id from, so anything derived from reservations would fall back
  // to the first trip and misfile students when a chapter has several.
  const tripForRoom = new Map(snapshot.rooms.map((r) => [r.id, r.trip_id]));

  const rows = assignments.map((a) => ({
    trip_id: tripForRoom.get(a.room_id) ?? tripIds[0],
    guest_id: a.guest_id,
    room_id: a.room_id,
    status: 'reserved',
    confirmation_code: makeConfirmation(),
  }));

  const { error } = await supabase.from('assignments').upsert(rows, { onConflict: 'guest_id' });
  if (error) return { data: null, error: err(error) };

  return { data: { assigned: assignments.length, unassigned: unassignedGuestIds.length }, error: null };
}

export async function unassignGuest(guestId: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;
  await expireKeysForGuest(guestId);
  const { error } = await supabase.from('assignments').delete().eq('guest_id', guestId);
  return error ? err(error) : null;
}

async function expireKeysForGuest(guestId: string) {
  await supabase
    .from('digital_keys')
    .update({ status: 'expired' })
    .eq('guest_id', guestId)
    .eq('status', 'active');
}

/** Check a guest in: flips the reservation, marks the room occupied, issues a digital key. */
export async function checkInGuest(
  tripId: string,
  guestId: string,
  roomId: string,
  stay: { check_in: string; check_out: string },
): Promise<Result<DigitalKey>> {
  if (isDemoMode()) return { data: null, error: DEMO_WRITE_MESSAGE };

  const { data: existing } = await supabase
    .from('assignments')
    .select('confirmation_code')
    .eq('guest_id', guestId)
    .maybeSingle();

  const { error } = await supabase
    .from('assignments')
    .upsert(
      [{
        trip_id: tripId,
        guest_id: guestId,
        room_id: roomId,
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
        check_in: stay.check_in,
        check_out: stay.check_out,
        // Walk-ins have no reservation yet; without this their pass reads "Conf —".
        confirmation_code: existing?.confirmation_code ?? makeConfirmation(),
      }],
      { onConflict: 'guest_id' },
    );
  if (error) return { data: null, error: err(error) };

  await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId).in('status', ['available', 'reserved']);

  const result = await issueKey({ tripId, guestId, roomId, checkOut: stay.check_out });

  const roomNumber = await lookupRoomNumber(roomId);
  await notify({ type: 'check_in_complete', tripId, guestId, roomId, context: { roomNumber, checkOut: stay.check_out } });
  if (result.data) {
    await notify({ type: 'key_issued', tripId, guestId, roomId, context: { roomNumber } });
  }
  return result;
}

/** Check a guest out: expires their keys, and frees the room for cleaning when it empties. */
export async function checkOutGuest(tripId: string, guestId: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;

  const { data: reservation } = await supabase
    .from('assignments')
    .select('id, room_id')
    .eq('guest_id', guestId)
    .maybeSingle();

  const { error } = await supabase
    .from('assignments')
    .update({ status: 'checked_out', checked_out_at: new Date().toISOString() })
    .eq('guest_id', guestId);
  if (error) return err(error);

  await expireKeysForReservation(guestId);

  const roomId = reservation?.room_id;
  if (roomId) {
    const { count } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('status', 'checked_in');
    if ((count ?? 0) === 0) {
      await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', roomId);
    }
  }
  return null;
}

/** Move a checked-in or reserved guest to a different room; keys follow automatically. */
export async function moveGuest(tripId: string, guestId: string, toRoomId: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;
  const { data: reservation } = await supabase
    .from('assignments')
    .select('id, room_id, status')
    .eq('guest_id', guestId)
    .maybeSingle();

  const fromRoomId = reservation?.room_id ?? null;

  const { error } = await supabase
    .from('assignments')
    .update({ room_id: toRoomId })
    .eq('guest_id', guestId);
  if (error) return err(error);

  await moveKeysToRoom(guestId, toRoomId);

  if (reservation?.status === 'checked_in') {
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', toRoomId).in('status', ['available', 'reserved']);
  }
  // Free the old room if nobody is left in it.
  if (fromRoomId) {
    const { count } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', fromRoomId)
      .in('status', ['reserved', 'checked_in']);
    if ((count ?? 0) === 0) {
      await supabase.from('rooms').update({ status: 'available' }).eq('id', fromRoomId).eq('status', 'occupied');
    }
  }
  return null;
}

export async function extendStay(guestId: string, newCheckOut: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;
  const { error } = await supabase
    .from('assignments')
    .update({ check_out: newCheckOut })
    .eq('guest_id', guestId);
  if (error) return err(error);

  // Wallet passes and keys track the reservation window.
  await supabase
    .from('digital_keys')
    .update({ valid_until: checkoutExpiry(newCheckOut) })
    .eq('guest_id', guestId)
    .eq('status', 'active');
  return null;
}

// ---------------------------------------------------------------------------
// Guest requests
// ---------------------------------------------------------------------------

export async function createGuestRequest(
  tripId: string,
  guestId: string,
  roomId: string | null,
  type: GuestRequestType,
  message: string,
): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;

  const { error } = await supabase
    .from('guest_requests')
    .insert([{ trip_id: tripId, guest_id: guestId, room_id: roomId, type, message }]);
  if (error) return err(error);

  const [{ data: guest }, roomNumber] = await Promise.all([
    supabase.from('guests').select('legal_name').eq('id', guestId).maybeSingle(),
    lookupRoomNumber(roomId),
  ]);

  await notify({
    type: type === 'issue' ? 'maintenance_update' : 'room_request',
    tripId,
    roomId,
    context: { roomNumber, guestName: guest?.legal_name, detail: message },
    data: { requestType: type },
  });
  return null;
}

export async function resolveGuestRequest(requestId: string): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;
  const { error } = await supabase
    .from('guest_requests')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', requestId);
  return error ? err(error) : null;
}

// ---------------------------------------------------------------------------
// Realtime: one channel covering everything the dashboard cares about
// ---------------------------------------------------------------------------

export function subscribeToHotel(tripId: string, onChange: () => void): () => void {
  if (isDemoMode()) return () => {};

  const channel = supabase
    .channel(`hotel-${tripId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guests', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'digital_keys', filter: `trip_id=eq.${tripId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_requests', filter: `trip_id=eq.${tripId}` }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Property-wide realtime. Postgres change filters can't express "in (...)", so
 * this listens broadly and lets the reload re-query — row level security is
 * what decides which of those rows the user can actually read back.
 */
export function subscribeToScope(channelKey: string, onChange: () => void): () => void {
  if (isDemoMode()) return () => {};

  const channel = supabase.channel(`scope-${channelKey}`);
  ['rooms', 'assignments', 'guests', 'digital_keys', 'guest_requests'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  });
  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Date helpers live in ./dates so they can be shared without an import cycle.
// ---------------------------------------------------------------------------

export { todayISO, tomorrowISO, formatDate, nightsBetween, checkoutExpiry } from './dates';
