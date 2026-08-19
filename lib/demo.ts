import {
  DigitalKey,
  GuestRequest,
  HotelGuest,
  Reservation,
  RoomWithOccupancy,
  TripSummary,
} from './hotelTypes';
import { HotelSnapshot } from './hotel';
import { checkoutExpiry } from './dates';

/**
 * Demo mode: a complete, believable property that lives entirely in memory.
 *
 * The point is to be able to look at and click through the whole app without a
 * configured database. The data layer checks `isDemoMode()` and returns these
 * fixtures instead of querying Supabase; writes are refused with a friendly
 * message rather than silently doing nothing.
 */
let demoMode = false;

export const isDemoMode = () => demoMode;
export const setDemoMode = (on: boolean) => {
  demoMode = on;
};

export const DEMO_WRITE_MESSAGE =
  'This is the demo — it runs on sample data, so changes are not saved. Run the two SQL migrations to use a real database.';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

const stamp = (offsetHours: number) => {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours);
  return d.toISOString();
};

export const DEMO_TRIP: TripSummary = {
  id: 'demo-trip',
  name: 'DECA State Career Conference',
  hotel_name: 'Harborview Grand Hotel',
  trip_code: 'DEMO24',
};

export const DEMO_HOTEL = {
  id: 'demo-hotel',
  name: 'Harborview Grand Hotel',
  code: 'HARBOR-01',
  address: '1200 Harbor Boulevard',
  city: 'Seattle',
  region: 'WA',
  postal_code: '98101',
  phone: '(206) 555-0142',
};
export const DEMO_CHAPTER = { id: 'demo-chapter', name: 'Lincoln High DECA', code: 'LINCOLN-01' };

type GuestSeed = [string, string, string, boolean];

const GUEST_SEEDS: GuestSeed[] = [
  ['g1', 'Sarah Johnson', 'Lincoln High', false],
  ['g2', 'Michael Torres', 'Lincoln High', false],
  ['g3', 'Priya Raman', 'Lincoln High', false],
  ['g4', 'Devon Clarke', 'Lincoln High', false],
  ['g5', 'Ms. Angela Reyes', 'Lincoln High', true],
  ['g6', 'Jordan Whitfield', 'Lincoln High', false],
  ['g7', 'Emily Nakamura', 'Lincoln High', false],
  ['g8', 'Andre Boateng', 'Lincoln High', false],
  ['g9', 'Chloe Bennett', 'Lincoln High', false],
  ['g10', 'Mr. David Okonkwo', 'Lincoln High', true],
  ['g11', 'Tyler Brooks', 'Lincoln High', false],
  ['g12', 'Sofia Marquez', 'Lincoln High', false],
];

export const DEMO_GUESTS: HotelGuest[] = GUEST_SEEDS.map(([id, legal_name, school, is_chaperone], index) => ({
  id,
  legal_name,
  email: `${legal_name.split(' ').pop()!.toLowerCase()}@lincolnhigh.edu`,
  phone: `555-01${`${index}`.padStart(2, '0')}`,
  school,
  arrival_window: ['12-2 PM', '2-4 PM', '4-6 PM', '6-8 PM'][index % 4],
  is_chaperone,
}));

const guest = (id: string) => DEMO_GUESTS.find((g) => g.id === id) ?? null;

/** [roomId, number, type, capacity, floor, status, guestIds, checkedIn] */
type RoomSeed = [string, string, string, number, string, RoomWithOccupancy['status'], string[], boolean];

const ROOM_SEEDS: RoomSeed[] = [
  ['r1', '204', 'Double Queen', 4, '2', 'occupied', ['g1', 'g2'], true],
  ['r2', '206', 'Quadruple', 4, '2', 'occupied', ['g3', 'g4', 'g6'], true],
  ['r3', '208', 'King', 2, '2', 'occupied', ['g5'], true],
  ['r4', '210', 'Double Queen', 4, '2', 'reserved', ['g7', 'g8'], false],
  ['r5', '301', 'Quadruple', 4, '3', 'reserved', ['g9', 'g11'], false],
  ['r6', '303', 'King', 2, '3', 'occupied', ['g10'], true],
  ['r7', '305', 'Double', 2, '3', 'available', [], false],
  ['r8', '307', 'Family Suite', 6, '3', 'available', [], false],
  ['r9', '309', 'Queen', 2, '3', 'cleaning', [], false],
  ['r10', '311', 'Single', 1, '3', 'maintenance', [], false],
];

const buildReservations = (): Reservation[] => {
  const rows: Reservation[] = [];
  ROOM_SEEDS.forEach(([roomId, , , , , , guestIds, checkedIn]) => {
    guestIds.forEach((guestId, index) => {
      rows.push({
        id: `res-${roomId}-${guestId}`,
        trip_id: DEMO_TRIP.id,
        guest_id: guestId,
        room_id: roomId,
        status: checkedIn ? 'checked_in' : 'reserved',
        check_in: checkedIn ? iso(-1) : iso(0),
        check_out: roomId === 'r3' ? iso(0) : iso(2),
        checked_in_at: checkedIn ? stamp(-20) : null,
        checked_out_at: null,
        confirmation_code: `GS-${roomId.toUpperCase()}${index}${guestId.slice(1)}`,
      });
    });
  });
  // One student who has not been given a room yet.
  rows.push({
    id: 'res-unassigned',
    trip_id: DEMO_TRIP.id,
    guest_id: 'g12',
    room_id: null,
    status: 'reserved',
    check_in: iso(0),
    check_out: iso(2),
    checked_in_at: null,
    checked_out_at: null,
    confirmation_code: 'GS-PENDING',
  });
  return rows;
};

export const DEMO_RESERVATIONS = buildReservations();

export const DEMO_KEYS: DigitalKey[] = DEMO_RESERVATIONS.filter((r) => r.status === 'checked_in').map((r) => ({
  id: `key-${r.guest_id}`,
  trip_id: DEMO_TRIP.id,
  guest_id: r.guest_id,
  room_id: r.room_id,
  key_token: `demo-token-${r.guest_id}-${'0'.repeat(8)}`,
  pass_serial: `GS-${r.guest_id.toUpperCase()}${'X'.repeat(4)}`,
  status: 'active',
  valid_from: stamp(-24),
  valid_until: checkoutExpiry(r.check_out ?? ''),
  activated_at: stamp(-20),
  revoked_at: null,
  wallet_added_at: r.guest_id === 'g1' ? stamp(-18) : null,
  shared_by: r.guest_id === 'g2' ? 'g1' : null,
  last_unlock_at: stamp(-3),
}));

export const DEMO_REQUESTS: GuestRequest[] = [
  {
    id: 'req1',
    trip_id: DEMO_TRIP.id,
    guest_id: 'g3',
    room_id: 'r2',
    type: 'housekeeping',
    message: 'Could we get two more towels please?',
    status: 'open',
    created_at: stamp(-2),
  },
  {
    id: 'req2',
    trip_id: DEMO_TRIP.id,
    guest_id: 'g5',
    room_id: 'r3',
    type: 'late_checkout',
    message: 'Our awards session ends at 1pm.',
    status: 'open',
    created_at: stamp(-5),
  },
];

const buildRooms = (): RoomWithOccupancy[] =>
  ROOM_SEEDS.map(([id, room_number, room_type, capacity, floor, status, guestIds]) => {
    const reservations = DEMO_RESERVATIONS.filter((r) => r.room_id === id).map((r) => ({
      ...r,
      guest: guest(r.guest_id),
    }));
    return {
      id,
      trip_id: DEMO_TRIP.id,
      room_number,
      room_type,
      capacity,
      max_guests: capacity,
      school: 'Lincoln High',
      status,
      notes:
        id === 'r8'
          ? 'Corner suite, connecting door to 309. Rollaway available on request.'
          : id === 'r1'
            ? 'Two queen beds, harbour-facing.'
            : null,
      photos: [],
      floor,
      housekeeping_note: id === 'r10' ? 'Shower valve replacement scheduled' : null,
      reservations,
      activeKeyCount: DEMO_KEYS.filter((k) => k.room_id === id && k.status === 'active').length,
    };
  });

export const demoSnapshot = (): HotelSnapshot => ({
  rooms: buildRooms(),
  guests: DEMO_GUESTS,
  reservations: DEMO_RESERVATIONS,
  keys: DEMO_KEYS,
  requests: DEMO_REQUESTS,
  migrationPending: false,
});

/** The student whose stay is shown in the guest experience. */
export const DEMO_STUDENT_GUEST_ID = 'g1';

export const demoStay = () => {
  const me = guest(DEMO_STUDENT_GUEST_ID)!;
  const reservation = DEMO_RESERVATIONS.find((r) => r.guest_id === DEMO_STUDENT_GUEST_ID)!;
  const room = buildRooms().find((r) => r.id === reservation.room_id)!;
  const roommates = room.reservations
    .filter((r) => r.guest_id !== DEMO_STUDENT_GUEST_ID)
    .map((r) => r.guest)
    .filter((g): g is HotelGuest => g != null);

  return {
    guest: me,
    reservation,
    room,
    key: DEMO_KEYS.find((k) => k.guest_id === DEMO_STUDENT_GUEST_ID) ?? null,
    roommates,
    sharedByName: null as string | null,
  };
};
