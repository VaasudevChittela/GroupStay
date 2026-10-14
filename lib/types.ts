export type Role = 'Advisor' | 'Student' | 'Chaperone' | 'Hotel Staff' | 'Parent';
export type Gender = 'Male' | 'Female' | 'Other';

export const ROLES: Role[] = ['Advisor', 'Student', 'Chaperone', 'Hotel Staff', 'Parent'];
export const GENDERS: Gender[] = ['Male', 'Female', 'Other'];

// Account details live in the Supabase auth user's metadata.
export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role | null;
  phone: string;
  gender: Gender | '';
  school: string;
};

export type Trip = {
  id: number;
  name: string;
  hotel_name: string;
  hotel_address: string | null;
  hotel_email: string | null;
  school: string | null;
  headcount: number | null;
  check_in: string | null;
  check_out: string | null;
  trip_code: string;
  advisor_id: string | null;
  arrival_time: string | null;
  locked_at: string | null;
  manifest_sent_at: string | null;
  // Rooms lock automatically at this time (ISO string) if the advisor hasn't locked them yet.
  lock_deadline: string | null;
  // When true, chaperones and students never share a room.
  separate_chaperones: boolean;
  // Text parents agree to when they sign the digital permission slip.
  permission_slip_text: string | null;
  // How many beds short the hotel was last warned about (so warnings aren't repeated).
  beds_short_notified: number;
};

export const TRIP_COLUMNS =
  'id, name, hotel_name, hotel_address, hotel_email, school, headcount, check_in, check_out, trip_code, advisor_id, arrival_time, locked_at, manifest_sent_at, lock_deadline, separate_chaperones, permission_slip_text, beds_short_notified';

export type Room = {
  id: number;
  trip_id: number;
  room_number: string;
  capacity: number;
  room_type: string;
  school: string;
  gender: Gender | null;
  ready_at: string | null;
};

export const ROOM_COLUMNS = 'id, trip_id, room_number, capacity, room_type, school, gender, ready_at';

export type Guest = {
  id: number;
  trip_id: number;
  user_id: string | null;
  legal_name: string;
  email: string | null;
  phone: string | null;
  school: string;
  gender: Gender | null;
  is_chaperone: boolean;
  share_location: boolean;
  roommate_request_id: number | null;
  checked_in_at: string | null;
};

export const GUEST_COLUMNS =
  'id, trip_id, user_id, legal_name, email, phone, school, gender, is_chaperone, share_location, roommate_request_id, checked_in_at';

// Private details: only the student, the trip's advisors, and the trip's chaperones can read these.
export type GuestDetails = {
  guest_id: number;
  trip_id: number;
  emergency_name: string | null;
  emergency_relationship: string | null;
  emergency_phone: string | null;
  medical_notes: string | null;
  // The parent/guardian who can log in to follow this student's trip and sign the slip.
  parent_email: string | null;
};

export const GUEST_DETAILS_COLUMNS = 'guest_id, trip_id, emergency_name, emergency_relationship, emergency_phone, medical_notes, parent_email';

export type CoAdvisor = { id: number; trip_id: number; email: string; created_at: string };

export type RoomRequest = {
  id: number;
  trip_id: number;
  room_id: number;
  guest_id: number;
  from_guest_id: number | null;
  kind: 'invite' | 'request';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
};

export type NotificationItem = {
  id: number;
  trip_id: number;
  audience: 'guest' | 'advisor' | 'staff';
  guest_id: number | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  // Which screen tapping the notification opens.
  link: NotificationLink | null;
};

export type NotificationLink =
  | 'rooms'
  | 'messages'
  | 'myinfo'
  | 'assign'
  | 'roster'
  | 'checkin'
  | 'manifest'
  | 'team'
  | 'schedule'
  | 'roomchecks'
  | 'history'
  | 'slip';

export type PermissionSlip = { id: number; guest_id: number; trip_id: number; signed_name: string; signed_email: string; signed_at: string };

export type ScheduleItem = { id: number; trip_id: number; starts_at: string; title: string; location: string | null; notes: string | null };

export type RoomCheck = {
  id: number;
  trip_id: number;
  room_id: number;
  night: string; // YYYY-MM-DD
  status: 'ok' | 'issue';
  note: string | null;
  checked_by: string;
  created_at: string;
};

export type RoomHistoryEntry = {
  id: number;
  trip_id: number;
  guest_id: number;
  guest_name: string;
  action: 'joined' | 'left' | 'moved' | 'assigned' | 'removed';
  from_room: string | null;
  to_room: string | null;
  changed_by: string;
  created_at: string;
};

export const DEFAULT_SLIP_TEXT =
  'I give permission for my child to attend this trip, to stay in the room assigned through GroupStay, and to receive emergency medical care if I cannot be reached. I understand chaperones will supervise and that school rules apply for the whole trip.';
