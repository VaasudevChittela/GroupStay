-- GroupStay — Base schema
--
-- The five tables the original app was built on. Later migrations ALTER these,
-- so on a fresh Supabase project this has to run first; on a project that
-- already has them it is a no-op.
--
-- Idempotent. Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Guard: later migrations add uuid foreign keys to these tables. If a project
-- already has them with integer ids, adding those keys would fail partway
-- through with a confusing type error — so stop here with a clear one instead.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(format('%s.%s is %s', table_name, column_name, data_type), ', ')
  into bad
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('trips', 'guests', 'rooms', 'assignments')
    and column_name = 'id'
    and data_type <> 'uuid';

  if bad is not null then
    raise exception
      'GroupStay expects uuid primary keys, but found: %. These migrations cannot convert an existing integer-keyed schema — start from an empty project, or migrate the ids first.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trips — one group's stay at one hotel
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hotel_name text,
  trip_code text not null unique,
  status text not null default 'draft',
  check_in date,
  check_out date,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Guests — the students and chaperones on a trip
-- ---------------------------------------------------------------------------
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  legal_name text not null,
  email text,
  phone text,
  school text,
  arrival_window text,
  is_chaperone boolean not null default false,
  roommate_request_id uuid references public.guests (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists guests_trip_idx on public.guests (trip_id);

-- ---------------------------------------------------------------------------
-- Rooms — the block a hotel has set aside for the trip
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  room_number text not null,
  room_type text,
  capacity integer not null default 1,
  school text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assignments — which guest is in which room. 0001 grows this into a full
-- reservation record, and adds the unique index the app's upserts rely on.
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Messages — trip threads. Optional; the app degrades gracefully without it,
-- but creating it here keeps a fresh project fully functional.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  thread_id text not null,
  sender_name text,
  sender_role text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx on public.messages (thread_id, created_at desc);
