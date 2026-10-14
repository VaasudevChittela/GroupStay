// Starting data for demo mode. Every demo account uses DEMO_PASSWORD.
// To start over in the browser, use "Reset demo data" on the home screen.

export type DemoUser = { id: string; email: string; password: string; metadata: Record<string, any> };
export type DemoDb = { users: DemoUser[]; tables: Record<string, Record<string, any>[]> };

export const DEMO_PASSWORD = 'demo1234';

// Vaasudev's advisor account and the fake Riverside High students all use this password.
export const RIVERSIDE_PASSWORD = '123';

export const DEMO_ACCOUNTS = [
  { label: 'Vaasudev (Advisor)', email: 'vaasudev.chittela@gmail.com', password: RIVERSIDE_PASSWORD },
  { label: 'Riverside Student', email: 'ethan.brooks@riverside.test', password: RIVERSIDE_PASSWORD },
  { label: 'Hilton Front Desk', email: 'frontdesk@hiltonorlando.test', password: RIVERSIDE_PASSWORD },
  { label: 'Parent (Ethan)', email: 'karen.brooks@riverside.test', password: RIVERSIDE_PASSWORD },
  { label: 'Advisor', email: 'advisor@groupstay.test', password: DEMO_PASSWORD },
  { label: 'Student', email: 'student@groupstay.test', password: DEMO_PASSWORD },
  { label: 'Chaperone', email: 'chaperone@groupstay.test', password: DEMO_PASSWORD },
  { label: 'Hotel Staff', email: 'frontdesk@grandhotel.test', password: DEMO_PASSWORD },
] as const;

// Fake students and chaperones for Vaasudev's school. They start on the seeded Riverside trip at
// Hilton Orlando (code RVRS27) with no rooms picked yet.
const RIVERSIDE_PEOPLE: Array<[name: string, gender: 'Male' | 'Female', role: 'Student' | 'Chaperone']> = [
  ['Ethan Brooks', 'Male', 'Student'],
  ['Liam Carter', 'Male', 'Student'],
  ['Noah Ramirez', 'Male', 'Student'],
  ['Mason Wright', 'Male', 'Student'],
  ['Olivia Bennett', 'Female', 'Student'],
  ['Sophia Hayes', 'Female', 'Student'],
  ['Emma Foster', 'Female', 'Student'],
  ['Isabella Price', 'Female', 'Student'],
  ['Grace Turner', 'Female', 'Chaperone'],
  ['Daniel Ortiz', 'Male', 'Chaperone'],
];

export function riversideUsers(): DemoUser[] {
  const advisor: DemoUser = {
    id: 'demo-vaasudev',
    email: 'vaasudev.chittela@gmail.com',
    password: RIVERSIDE_PASSWORD,
    metadata: { full_name: 'Vaasudev Chittela', role: 'Advisor', phone: '555-0200', gender: '', school: 'Riverside High' },
  };
  const people = RIVERSIDE_PEOPLE.map(([name, gender, role], index): DemoUser => {
    const [first, last] = name.toLowerCase().split(' ');
    return {
      id: `demo-riverside-${index + 1}`,
      email: `${first}.${last}@riverside.test`,
      password: RIVERSIDE_PASSWORD,
      metadata: { full_name: name, role, phone: `555-02${String(index + 10)}`, gender, school: 'Riverside High' },
    };
  });
  const hiltonStaff: DemoUser = {
    id: 'demo-hilton-staff',
    email: 'frontdesk@hiltonorlando.test',
    password: RIVERSIDE_PASSWORD,
    metadata: { full_name: 'Hilton Orlando Front Desk', role: 'Hotel Staff', phone: '555-0300', gender: '', school: '' },
  };
  // Ethan Brooks' mom, linked through Ethan's My Info (parent email).
  const parent: DemoUser = {
    id: 'demo-riverside-parent',
    email: 'karen.brooks@riverside.test',
    password: RIVERSIDE_PASSWORD,
    metadata: { full_name: 'Karen Brooks', role: 'Parent', phone: '555-0410', gender: '', school: '' },
  };
  return [advisor, ...people, hiltonStaff, parent];
}

export function createSeedDb(): DemoDb {
  const now = new Date().toISOString();
  const users: DemoUser[] = [
    {
      id: 'demo-advisor',
      email: 'advisor@groupstay.test',
      password: DEMO_PASSWORD,
      metadata: { full_name: 'Dana Rivera', role: 'Advisor', phone: '555-0100', gender: 'Female', school: 'Lincoln High' },
    },
    {
      id: 'demo-student',
      email: 'student@groupstay.test',
      password: DEMO_PASSWORD,
      metadata: { full_name: 'Jordan Lee', role: 'Student', phone: '555-0101', gender: 'Male', school: 'Lincoln High' },
    },
    {
      id: 'demo-chaperone',
      email: 'chaperone@groupstay.test',
      password: DEMO_PASSWORD,
      metadata: { full_name: 'Pat Morgan', role: 'Chaperone', phone: '555-0102', gender: 'Female', school: 'Lincoln High' },
    },
    {
      id: 'demo-staff',
      email: 'frontdesk@grandhotel.test',
      password: DEMO_PASSWORD,
      metadata: { full_name: 'Grand Hotel Front Desk', role: 'Hotel Staff', phone: '555-0199', gender: '', school: '' },
    },
    ...riversideUsers(),
  ];

  const trip = (id: number, values: Record<string, any>) => ({
    id,
    created_at: now,
    hotel_name: 'Grand Hotel Downtown',
    hotel_address: '100 Main Street, Springfield, Illinois, United States',
    hotel_email: 'frontdesk@grandhotel.test',
    headcount: 30,
    check_in: '2026-11-14',
    check_out: '2026-11-16',
    status: 'active',
    locked_at: null,
    manifest_sent_at: null,
    lock_deadline: null,
    separate_chaperones: true,
    permission_slip_text: null,
    beds_short_notified: 0,
    ...values,
  });

  const room = (id: number, trip_id: number, room_number: string, capacity: number, gender: string | null, school: string) => ({
    id,
    trip_id,
    room_number,
    capacity,
    room_type: capacity === 1 ? 'Single' : capacity === 2 ? 'Double' : capacity === 4 ? 'Quad' : `${capacity}-person`,
    gender,
    school,
    ready_at: null,
    created_at: now,
  });

  const guest = (id: number, legal_name: string, gender: string, values: Record<string, any> = {}) => ({
    id,
    trip_id: 1,
    user_id: null,
    legal_name,
    email: `${legal_name.split(' ')[0].toLowerCase()}@lincoln.test`,
    phone: `555-01${10 + id}`,
    school: 'Lincoln High',
    gender,
    arrival_window: null,
    is_chaperone: false,
    share_location: false,
    roommate_request_id: null,
    checked_in_at: null,
    created_at: now,
    ...values,
  });

  return {
    users,
    tables: {
      trips: [
        trip(1, {
          name: 'DECA State Conference',
          school: 'Lincoln High',
          trip_code: 'DECA26',
          advisor_id: 'demo-advisor',
          arrival_time: '14:30',
          // Lincoln's chaperone shares a room with students, to show the per-trip setting.
          separate_chaperones: false,
        }),
        trip(3, {
          name: 'DECA ICDC 2027',
          school: 'Riverside High',
          trip_code: 'RVRS27',
          advisor_id: 'demo-vaasudev',
          hotel_name: 'Hilton Orlando',
          hotel_address: '6001 Destination Parkway, Orlando, Florida, United States',
          hotel_email: 'frontdesk@hiltonorlando.test',
          headcount: 12,
          check_in: '2027-04-24',
          check_out: '2027-04-27',
          arrival_time: '15:00',
          lock_deadline: '2027-04-20T21:00:00.000Z',
        }),
        trip(2, { name: 'DECA State Conference', school: 'Westview High', trip_code: 'WEST26', advisor_id: 'demo-advisor-2', arrival_time: '12:00', headcount: 12, locked_at: now, manifest_sent_at: now }),
      ],
      rooms: [
        room(1, 1, '401', 4, 'Male', 'Lincoln High'),
        room(2, 1, '402', 4, 'Female', 'Lincoln High'),
        room(3, 1, '403', 2, 'Male', 'Lincoln High'),
        room(4, 1, '404', 2, null, 'Lincoln High'),
        room(5, 2, '301', 4, 'Male', 'Westview High'),
        room(6, 2, '302', 4, 'Female', 'Westview High'),
        room(7, 3, '1201', 4, 'Male', 'Riverside High'),
        room(8, 3, '1202', 2, 'Male', 'Riverside High'),
        room(9, 3, '1203', 4, 'Female', 'Riverside High'),
        room(10, 3, '1204', 2, 'Female', 'Riverside High'),
        room(11, 3, '1205', 2, null, 'Riverside High'),
        room(12, 3, '1206', 1, 'Female', 'Riverside High'),
        room(13, 3, '1207', 1, 'Male', 'Riverside High'),
      ],
      guests: [
        guest(1, 'Jordan Lee', 'Male', { user_id: 'demo-student', email: 'student@groupstay.test', phone: '555-0101' }),
        guest(2, 'Sam Patel', 'Male'),
        guest(3, 'Alex Kim', 'Male'),
        guest(4, 'Chris Diaz', 'Male'),
        guest(5, 'Maya Chen', 'Female'),
        guest(6, 'Ava Johnson', 'Female'),
        guest(7, 'Pat Morgan', 'Female', { user_id: 'demo-chaperone', email: 'chaperone@groupstay.test', phone: '555-0102', is_chaperone: true }),
        guest(8, 'Riley Brooks', 'Male', { trip_id: 2, school: 'Westview High' }),
        guest(9, 'Taylor Nguyen', 'Female', { trip_id: 2, school: 'Westview High' }),
        ...riversideUsers()
          .filter((user) => user.metadata.role === 'Student' || user.metadata.role === 'Chaperone')
          .map((user, index) =>
            guest(10 + index, user.metadata.full_name, user.metadata.gender, {
              checked_in_at: null,
              trip_id: 3,
              user_id: user.id,
              email: user.email,
              phone: user.metadata.phone,
              school: 'Riverside High',
              is_chaperone: user.metadata.role === 'Chaperone',
            }),
          ),
      ],
      assignments: [
        { id: 1, trip_id: 1, guest_id: 2, room_id: 1, created_at: now },
        { id: 2, trip_id: 1, guest_id: 3, room_id: 1, created_at: now },
        { id: 3, trip_id: 1, guest_id: 5, room_id: 2, created_at: now },
        { id: 4, trip_id: 1, guest_id: 7, room_id: 2, created_at: now },
        { id: 5, trip_id: 2, guest_id: 8, room_id: 5, created_at: now },
        { id: 6, trip_id: 2, guest_id: 9, room_id: 6, created_at: now },
      ],
      room_requests: [],
      // Vaasudev also helps run Lincoln High's trip, to show co-advisors.
      trip_advisors: [{ id: 1, trip_id: 1, email: 'vaasudev.chittela@gmail.com', created_at: now }],
      guest_details: [
        { id: 1, guest_id: 10, trip_id: 3, emergency_name: 'Karen Brooks', emergency_relationship: 'Mother', emergency_phone: '555-0410', medical_notes: null, parent_email: 'karen.brooks@riverside.test', created_at: now },
        { id: 2, guest_id: 11, trip_id: 3, emergency_name: 'Mark Carter', emergency_relationship: 'Father', emergency_phone: '555-0411', medical_notes: 'Asthma: carries an inhaler', parent_email: 'mark.carter@riverside.test', created_at: now },
        { id: 3, guest_id: 16, trip_id: 3, emergency_name: 'Lisa Foster', emergency_relationship: 'Mother', emergency_phone: '555-0416', medical_notes: 'Peanut allergy (EpiPen in backpack)', parent_email: null, created_at: now },
      ],
      push_tokens: [],
      permission_slips: [
        { id: 1, guest_id: 11, trip_id: 3, signed_name: 'Mark Carter', signed_email: 'mark.carter@riverside.test', signed_at: now, created_at: now },
      ],
      schedule_items: [
        { id: 1, trip_id: 3, starts_at: '2027-04-24T10:00:00', title: 'Bus leaves Riverside High', location: 'Front parking lot', notes: 'Be there by 9:45. One suitcase + one backpack.', created_at: now },
        { id: 2, trip_id: 3, starts_at: '2027-04-24T15:00:00', title: 'Hotel check-in', location: 'Hilton Orlando lobby', notes: null, created_at: now },
        { id: 3, trip_id: 3, starts_at: '2027-04-24T18:30:00', title: 'Team dinner', location: 'Hotel ballroom B', notes: 'Business casual.', created_at: now },
        { id: 4, trip_id: 3, starts_at: '2027-04-25T08:00:00', title: 'Opening session', location: 'Orange County Convention Center, Hall WA', notes: 'Wear your name badge.', created_at: now },
        { id: 5, trip_id: 3, starts_at: '2027-04-27T11:00:00', title: 'Check-out and bus home', location: 'Hilton Orlando lobby', notes: null, created_at: now },
      ],
      room_checks: [],
      room_history: [],
      notifications: [
        {
          id: 1,
          trip_id: 1,
          audience: 'staff',
          guest_id: null,
          title: 'New trip booked',
          body: 'Lincoln High – DECA State Conference (30 guests, Nov 14–16). Please add your room inventory.',
          created_at: now,
          read_at: null,
          link: null,
        },
        {
          id: 2,
          trip_id: 2,
          audience: 'staff',
          guest_id: null,
          title: 'Manifest received',
          body: 'Westview High locked their rooms. Arrival 12:00 PM.',
          created_at: now,
          read_at: null,
          link: 'manifest',
        },
        {
          id: 3,
          trip_id: 3,
          audience: 'staff',
          guest_id: null,
          title: 'New trip booked',
          body: 'Riverside High – DECA ICDC 2027 (12 guests, Apr 24–27). Rooms 1201–1205 are on hold for this group.',
          created_at: now,
          read_at: null,
          link: null,
        },
      ],
      messages: [
        {
          id: 2,
          trip_id: 3,
          thread_id: 'everyone-3',
          sender_name: 'Vaasudev Chittela',
          sender_role: 'advisor',
          content: 'Pick your rooms and add an emergency contact under My Info before April 20!',
          pinned: true,
          created_at: now,
        },
        {
          id: 1,
          trip_id: 1,
          thread_id: 'everyone-1',
          sender_name: 'Dana Rivera',
          sender_role: 'advisor',
          content: 'Welcome to the trip! Pick your rooms before Friday.',
          created_at: now,
        },
      ],
      locations: [],
    },
  };
}
