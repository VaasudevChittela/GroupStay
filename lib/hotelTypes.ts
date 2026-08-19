export const ROOM_TYPES = [
  'Single',
  'Double',
  'Queen',
  'King',
  'Double Queen',
  'Quadruple',
  'Family Suite',
  'Custom',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

/** Sensible default sleeping capacity per room type. */
export const ROOM_TYPE_DEFAULT_CAPACITY: Record<RoomType, number> = {
  Single: 1,
  Double: 2,
  Queen: 2,
  King: 2,
  'Double Queen': 4,
  Quadruple: 4,
  'Family Suite': 6,
  Custom: 2,
};

export const ROOM_STATUSES = [
  'available',
  'occupied',
  'reserved',
  'cleaning',
  'maintenance',
  'out_of_service',
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_STATUS_META: Record<RoomStatus, { label: string }> = {
  available: { label: 'Available' },
  occupied: { label: 'Occupied' },
  reserved: { label: 'Reserved' },
  cleaning: { label: 'Cleaning' },
  maintenance: { label: 'Maintenance' },
  out_of_service: { label: 'Out of Service' },
};

export type HotelRoom = {
  id: string;
  trip_id: string;
  room_number: string;
  room_type: string;
  capacity: number;
  max_guests: number | null;
  school: string | null;
  status: RoomStatus;
  notes: string | null;
  photos: string[];
  floor: string | null;
  housekeeping_note: string | null;
};

export type ReservationStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled';

export type Reservation = {
  id: string;
  trip_id: string;
  guest_id: string;
  room_id: string | null;
  status: ReservationStatus;
  check_in: string | null;
  check_out: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  confirmation_code: string | null;
};

export type HotelGuest = {
  id: string;
  legal_name: string;
  email: string | null;
  phone: string | null;
  school: string | null;
  arrival_window: string | null;
  is_chaperone: boolean;
};

export type KeyStatus = 'active' | 'revoked' | 'expired';

export type DigitalKey = {
  id: string;
  trip_id: string;
  guest_id: string;
  room_id: string | null;
  key_token: string;
  pass_serial: string;
  status: KeyStatus;
  valid_from: string;
  valid_until: string;
  activated_at: string | null;
  revoked_at: string | null;
  wallet_added_at: string | null;
  shared_by: string | null;
  last_unlock_at: string | null;
};

export type GuestRequestType = 'housekeeping' | 'issue' | 'late_checkout' | 'amenity';

export type GuestRequest = {
  id: string;
  trip_id: string;
  guest_id: string | null;
  room_id: string | null;
  type: GuestRequestType;
  message: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
};

/** A room joined with its current occupants + key info — what the dashboard renders. */
export type RoomWithOccupancy = HotelRoom & {
  reservations: (Reservation & { guest: HotelGuest | null })[];
  activeKeyCount: number;
};

export type TripSummary = { id: string; name: string; hotel_name: string; trip_code: string };
