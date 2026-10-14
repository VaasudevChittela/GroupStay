// A small in-browser stand-in for Supabase, used when EXPO_PUBLIC_DEMO_MODE=true.
// It implements only the query-builder and auth calls this app makes, and saves
// everything to localStorage (or memory on native) so the app works with no server.

import { createSeedDb, DemoDb, DemoUser, riversideUsers } from './demoSeed';

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };

// Bump the version when the seed changes so every browser starts from the new seed.
const DB_KEY = 'groupstay-demo-db-v5';
const SESSION_KEY = 'groupstay-demo-session-v5';

const memoryStore = new Map<string, string>();
const storage = {
  getItem(key: string) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch {}
    return memoryStore.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {}
    memoryStore.set(key, value);
  },
};

// Columns that must be unique, mirroring supabase/schema.sql.
const UNIQUE: Record<string, string[]> = {
  trips: ['trip_code'],
  assignments: ['guest_id'],
  locations: ['guest_id'],
  guest_details: ['guest_id'],
  push_tokens: ['token'],
  permission_slips: ['guest_id'],
};

// Column defaults, mirroring supabase/schema.sql.
const DEFAULTS: Record<string, Row> = {
  guests: { is_chaperone: false, share_location: false, roommate_request_id: null, user_id: null, gender: null, checked_in_at: null },
  guest_details: { emergency_name: null, emergency_relationship: null, emergency_phone: null, medical_notes: null, parent_email: null },
  messages: { pinned: false },
  schedule_items: { location: null, notes: null },
  room_checks: { note: null },
  rooms: { gender: null, ready_at: null },
  trips: {
    hotel_address: null,
    locked_at: null,
    manifest_sent_at: null,
    arrival_time: null,
    status: 'active',
    lock_deadline: null,
    separate_chaperones: true,
    permission_slip_text: null,
    beds_short_notified: 0,
  },
  room_requests: { status: 'pending', from_guest_id: null },
  notifications: { read_at: null, guest_id: null, link: null },
};

let db: DemoDb = loadDb();

function loadDb(): DemoDb {
  const raw = storage.getItem(DB_KEY);
  if (raw) {
    try {
      const saved: DemoDb = JSON.parse(raw);
      // Accounts added to the seed later show up without wiping a browser's saved demo data.
      for (const user of riversideUsers()) {
        if (!saved.users.some((u) => u.id === user.id || u.email === user.email)) saved.users.push(user);
      }
      return saved;
    } catch {}
  }
  const seeded = createSeedDb();
  storage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveDb() {
  storage.setItem(DB_KEY, JSON.stringify(db));
}

function table(name: string): Row[] {
  if (!db.tables[name]) db.tables[name] = [];
  return db.tables[name];
}

const clone = <T,>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function looseEqual(a: any, b: any) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return String(a) === String(b);
}

function likeToRegex(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

class DemoQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private payload: Row[] = [];
  private returning = false;
  private countMode = false;
  private headOnly = false;
  private conflictColumns: string[] = ['id'];

  constructor(private tableName: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.countMode = Boolean(options?.count);
      this.headOnly = Boolean(options?.head);
    } else {
      this.returning = true;
    }
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    if (options?.onConflict) this.conflictColumns = options.onConflict.split(',').map((c) => c.trim());
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.payload = [values];
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => looseEqual(row[column], value));
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((row) => !looseEqual(row[column], value));
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((row) => values.some((value) => looseEqual(row[column], value)));
    return this;
  }

  is(column: string, value: null | boolean) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'is') this.filters.push((row) => (row[column] ?? null) !== value);
    else this.filters.push((row) => !looseEqual(row[column], value));
    return this;
  }

  ilike(column: string, pattern: string) {
    const regex = likeToRegex(pattern);
    this.filters.push((row) => regex.test(String(row[column] ?? '')));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.execute()), 60)).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((filter) => filter(row));
  }

  private finish(rows: Row[]): Result {
    if (this.singleMode) {
      if (rows.length === 1) return { data: clone(rows[0]), error: null };
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null };
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    return { data: clone(rows), error: null };
  }

  private uniqueViolation(row: Row, ignoreId?: number) {
    for (const column of UNIQUE[this.tableName] ?? []) {
      if (row[column] === undefined || row[column] === null) continue;
      if (table(this.tableName).some((other) => other.id !== ignoreId && looseEqual(other[column], row[column]))) {
        return { message: `duplicate key value violates unique constraint "${this.tableName}_${column}_key"`, code: '23505' };
      }
    }
    return null;
  }

  private insertRow(values: Row) {
    const rows = table(this.tableName);
    const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    const row = { ...(DEFAULTS[this.tableName] ?? {}), created_at: new Date().toISOString(), ...values, id: values.id ?? id };
    rows.push(row);
    return row;
  }

  private execute(): Result {
    const rows = table(this.tableName);

    if (this.op === 'select') {
      let result = rows.filter((row) => this.matches(row));
      for (const { column, ascending } of [...this.orders].reverse()) {
        result = [...result].sort((a, b) => {
          const left = a[column] ?? '';
          const right = b[column] ?? '';
          const compare = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
          return ascending ? compare : -compare;
        });
      }
      const count = result.length;
      if (this.limitCount !== null) result = result.slice(0, this.limitCount);
      if (this.headOnly) return { data: null, error: null, count };
      return { ...this.finish(result), count: this.countMode ? count : null };
    }

    if (this.op === 'insert') {
      for (const values of this.payload) {
        const violation = this.uniqueViolation(values);
        if (violation) return { data: null, error: violation };
      }
      const inserted = this.payload.map((values) => this.insertRow(values));
      saveDb();
      return this.returning ? this.finish(inserted) : { data: null, error: null };
    }

    if (this.op === 'upsert') {
      const touched: Row[] = [];
      for (const values of this.payload) {
        const existing = rows.find((row) => this.conflictColumns.every((column) => looseEqual(row[column], values[column])));
        if (existing) {
          Object.assign(existing, values);
          touched.push(existing);
        } else {
          const violation = this.uniqueViolation(values);
          if (violation) return { data: null, error: violation };
          touched.push(this.insertRow(values));
        }
      }
      saveDb();
      return this.returning ? this.finish(touched) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const matched = rows.filter((row) => this.matches(row));
      for (const row of matched) {
        const violation = this.uniqueViolation({ ...row, ...this.payload[0] }, row.id);
        if (violation) return { data: null, error: violation };
      }
      matched.forEach((row) => Object.assign(row, this.payload[0]));
      saveDb();
      return this.returning ? this.finish(matched) : { data: null, error: null };
    }

    const removed = rows.filter((row) => this.matches(row));
    db.tables[this.tableName] = rows.filter((row) => !this.matches(row));
    saveDb();
    return this.returning ? this.finish(removed) : { data: null, error: null };
  }
}

type AuthListener = (event: string, session: any) => void;
const authListeners = new Set<AuthListener>();

function toSession(user: DemoUser) {
  return {
    access_token: `demo-${user.id}`,
    token_type: 'bearer',
    user: { id: user.id, email: user.email, user_metadata: clone(user.metadata) },
  };
}

function readSession() {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const userId = JSON.parse(raw);
    const user = db.users.find((u) => u.id === userId);
    return user ? toSession(user) : null;
  } catch {
    return null;
  }
}

function emit(event: string, session: any) {
  setTimeout(() => authListeners.forEach((listener) => listener(event, session)), 0);
}

const auth = {
  async getSession() {
    return { data: { session: readSession() }, error: null };
  },
  async getUser() {
    return { data: { user: readSession()?.user ?? null }, error: null };
  },
  onAuthStateChange(listener: AuthListener) {
    authListeners.add(listener);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }
    storage.setItem(SESSION_KEY, JSON.stringify(user.id));
    const session = toSession(user);
    emit('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, any> } }) {
    const normalized = email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalized)) {
      return { data: { user: null, session: null }, error: { message: 'User already registered' } };
    }
    if (password.length < 6) {
      return { data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters.' } };
    }
    const user: DemoUser = { id: `user-${Date.now()}`, email: normalized, password, metadata: options?.data ?? {} };
    db.users.push(user);
    saveDb();
    storage.setItem(SESSION_KEY, JSON.stringify(user.id));
    const session = toSession(user);
    emit('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  },
  async updateUser({ data }: { data?: Record<string, any> }) {
    const session = readSession();
    const user = session && db.users.find((u) => u.id === session.user.id);
    if (!user) return { data: { user: null }, error: { message: 'Not logged in' } };
    user.metadata = { ...user.metadata, ...(data ?? {}) };
    saveDb();
    const next = toSession(user);
    emit('USER_UPDATED', next);
    return { data: { user: next.user }, error: null };
  },
  async signOut() {
    storage.setItem(SESSION_KEY, JSON.stringify(null));
    emit('SIGNED_OUT', null);
    return { error: null };
  },
};

// ───── Server-side functions (mirror the SQL functions in supabase/schema.sql) ─────

function nextId(name: string) {
  return table(name).reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function addRow(name: string, values: Row) {
  const row = { ...(DEFAULTS[name] ?? {}), created_at: new Date().toISOString(), ...values, id: nextId(name) };
  table(name).push(row);
  return row;
}

const sameText = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

const RPC: Record<string, (args: Row) => Result> = {
  // Lets a student preview a trip before joining (students can't read trips they aren't on).
  find_trip_by_code({ p_code }) {
    const trip = table('trips').find((t) => sameText(t.trip_code, p_code));
    if (!trip) return { data: null, error: null };
    const { id, name, hotel_name, hotel_address, school, check_in, check_out, locked_at } = trip;
    return { data: { id, name, hotel_name, hotel_address, school, check_in, check_out, locked_at }, error: null };
  },

  // Joins the signed-in user to a trip. Reuses a guest row the advisor added with the same email.
  join_trip({ p_trip_id, p_full_name, p_phone, p_school, p_gender, p_is_chaperone }) {
    const session = readSession();
    if (!session) return { data: null, error: { message: 'Log in first.' } };
    const trip = table('trips').find((t) => t.id === p_trip_id);
    if (!trip) return { data: null, error: { message: 'Trip not found.' } };
    if (trip.school && !sameText(trip.school, p_school)) {
      return { data: null, error: { message: `This trip code is for ${trip.school}. Ask your advisor for your school's code.` } };
    }
    const guests = table('guests');
    const mine = guests.find((g) => g.trip_id === trip.id && g.user_id === session.user.id);
    if (mine) return { data: clone(mine), error: null };
    const added = guests.find((g) => g.trip_id === trip.id && !g.user_id && sameText(g.email, session.user.email));
    if (added) {
      Object.assign(added, {
        user_id: session.user.id,
        phone: added.phone || p_phone,
        gender: added.gender || p_gender,
        is_chaperone: added.is_chaperone || p_is_chaperone,
      });
      saveDb();
      return { data: clone(added), error: null };
    }
    const row = addRow('guests', {
      trip_id: trip.id,
      user_id: session.user.id,
      legal_name: p_full_name,
      email: session.user.email,
      phone: p_phone,
      school: trip.school ?? p_school,
      gender: p_gender,
      is_chaperone: p_is_chaperone,
    });
    saveDb();
    return { data: clone(row), error: null };
  },

  // First names of a student's roommates, for the student's parent (parents can't read the roster).
  roommate_names({ p_guest_id }) {
    const session = readSession();
    const details = table('guest_details').find((d) => d.guest_id === p_guest_id);
    const guest = table('guests').find((g) => g.id === p_guest_id);
    const allowed = session && guest && (guest.user_id === session.user.id || sameText(details?.parent_email, session.user.email));
    if (!allowed) return { data: [], error: null };
    const roomId = table('assignments').find((a) => a.guest_id === p_guest_id)?.room_id;
    if (!roomId) return { data: [], error: null };
    const names = table('assignments')
      .filter((a) => a.room_id === roomId && a.guest_id !== p_guest_id)
      .map((a) => String(table('guests').find((g) => g.id === a.guest_id)?.legal_name ?? '').split(' ')[0])
      .filter(Boolean);
    return { data: names, error: null };
  },

  // Locks the trip and sends the manifest once its lock deadline has passed.
  apply_lock_deadline({ p_trip_id }) {
    const trip = table('trips').find((t) => t.id === p_trip_id);
    if (!trip || trip.locked_at || !trip.lock_deadline || new Date(trip.lock_deadline).getTime() > Date.now()) {
      return { data: false, error: null };
    }
    const now = new Date().toISOString();
    Object.assign(trip, { locked_at: now, manifest_sent_at: now });
    table('room_requests')
      .filter((r) => r.trip_id === trip.id && r.status === 'pending')
      .forEach((r) => (r.status = 'cancelled'));
    addRow('notifications', {
      trip_id: trip.id,
      audience: 'staff',
      title: 'Manifest received',
      body: `${trip.school ?? trip.name} rooms locked automatically at the deadline.`,
      link: 'manifest',
    });
    addRow('notifications', {
      trip_id: trip.id,
      audience: 'advisor',
      title: 'Rooms locked automatically',
      body: `The room-pick deadline passed, so ${trip.name} is locked and the manifest went to the hotel.`,
      link: 'assign',
    });
    table('guests')
      .filter((g) => g.trip_id === trip.id)
      .forEach((g) =>
        addRow('notifications', {
          trip_id: trip.id,
          audience: 'guest',
          guest_id: g.id,
          title: 'Rooms are locked',
          body: 'The room-pick deadline passed. Check My Room for your final room.',
          link: 'rooms',
        }),
      );
    saveDb();
    return { data: true, error: null };
  },
};

export function createDemoClient() {
  return {
    from: (tableName: string) => new DemoQuery(tableName),
    rpc: (name: string, args: Row = {}) =>
      new Promise<Result>((resolve) =>
        setTimeout(() => resolve(RPC[name] ? RPC[name](args) : { data: null, error: { message: `Unknown function ${name}` } }), 60),
      ),
    auth,
  };
}

// Demo-only shortcut: put every demo student/chaperone account from the trip's school onto the
// trip, the same way they'd be added if each one logged in and entered the code.
export function addDemoStudentsToTrip(trip: { id: number; school: string | null }) {
  const school = (trip.school ?? '').trim().toLowerCase();
  const guests = table('guests');
  const added: string[] = [];
  for (const user of db.users) {
    const meta = user.metadata;
    if (meta.role !== 'Student' && meta.role !== 'Chaperone') continue;
    if ((meta.school ?? '').trim().toLowerCase() !== school) continue;
    if (guests.some((g) => g.user_id === user.id)) continue;
    const id = guests.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
    guests.push({
      id,
      created_at: new Date().toISOString(),
      trip_id: trip.id,
      user_id: user.id,
      legal_name: meta.full_name,
      email: user.email,
      phone: meta.phone ?? null,
      school: meta.school,
      gender: meta.gender || null,
      arrival_window: null,
      is_chaperone: meta.role === 'Chaperone',
      share_location: false,
      roommate_request_id: null,
    });
    added.push(meta.full_name);
  }
  saveDb();
  return added;
}

export function resetDemoData() {
  db = createSeedDb();
  saveDb();
  storage.setItem(SESSION_KEY, JSON.stringify(null));
  emit('SIGNED_OUT', null);
}
