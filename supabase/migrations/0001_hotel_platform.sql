-- GroupStay — Hotel room management + digital room keys
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Everything here is idempotent, so re-running it is safe.

-- ---------------------------------------------------------------------------
-- 1. Rooms: full property inventory fields
-- ---------------------------------------------------------------------------
alter table public.rooms add column if not exists status text not null default 'available';
alter table public.rooms add column if not exists max_guests integer;
alter table public.rooms add column if not exists notes text;
alter table public.rooms add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.rooms add column if not exists floor text;
alter table public.rooms add column if not exists housekeeping_note text;
alter table public.rooms add column if not exists updated_at timestamptz not null default now();

-- Older rows were created before max_guests existed; mirror capacity onto them.
update public.rooms set max_guests = capacity where max_guests is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_status_check') then
    alter table public.rooms add constraint rooms_status_check
      check (status in ('available', 'occupied', 'reserved', 'cleaning', 'maintenance', 'out_of_service'));
  end if;
end $$;

create index if not exists rooms_trip_id_idx on public.rooms (trip_id);
create index if not exists rooms_status_idx on public.rooms (status);

-- ---------------------------------------------------------------------------
-- 2. Assignments become reservations (stay dates + check-in lifecycle)
-- ---------------------------------------------------------------------------
alter table public.assignments add column if not exists status text not null default 'reserved';
alter table public.assignments add column if not exists check_in date;
alter table public.assignments add column if not exists check_out date;
alter table public.assignments add column if not exists checked_in_at timestamptz;
alter table public.assignments add column if not exists checked_out_at timestamptz;
alter table public.assignments add column if not exists confirmation_code text;
alter table public.assignments add column if not exists created_at timestamptz not null default now();
alter table public.assignments add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_status_check') then
    alter table public.assignments add constraint assignments_status_check
      check (status in ('reserved', 'checked_in', 'checked_out', 'cancelled'));
  end if;
end $$;

-- Backfill stay dates from the trip so existing reservations have a window.
update public.assignments a
set check_in = coalesce(a.check_in, t.check_in),
    check_out = coalesce(a.check_out, t.check_out)
from public.trips t
where t.id = a.trip_id and (a.check_in is null or a.check_out is null);

create index if not exists assignments_trip_id_idx on public.assignments (trip_id);
create index if not exists assignments_room_id_idx on public.assignments (room_id);

-- The app upserts reservations with onConflict: 'guest_id', which needs this.
create unique index if not exists assignments_guest_id_key on public.assignments (guest_id);

-- ---------------------------------------------------------------------------
-- 3. Digital room keys
-- ---------------------------------------------------------------------------
create table if not exists public.digital_keys (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null,
  key_token text not null unique,
  pass_serial text not null unique,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  wallet_added_at timestamptz,
  shared_by uuid references public.guests (id) on delete set null,
  last_unlock_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_keys_status_check
    check (status in ('active', 'revoked', 'expired'))
);

create unique index if not exists digital_keys_active_guest_room_idx
  on public.digital_keys (guest_id, room_id)
  where status = 'active';
create index if not exists digital_keys_room_idx on public.digital_keys (room_id);
create index if not exists digital_keys_trip_idx on public.digital_keys (trip_id);

-- ---------------------------------------------------------------------------
-- 4. Key audit trail — every unlock attempt, revoke, and wallet add
-- ---------------------------------------------------------------------------
create table if not exists public.key_events (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.digital_keys (id) on delete cascade,
  event text not null,
  method text,
  detail text,
  created_at timestamptz not null default now(),
  constraint key_events_event_check
    check (event in ('issued', 'activated', 'unlock_success', 'unlock_denied', 'revoked', 'expired', 'wallet_added', 'shared', 'room_changed'))
);

create index if not exists key_events_key_idx on public.key_events (key_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Guest requests — housekeeping, issues, late checkout
-- ---------------------------------------------------------------------------
create table if not exists public.guest_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  guest_id uuid references public.guests (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  type text not null,
  message text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint guest_requests_type_check
    check (type in ('housekeeping', 'issue', 'late_checkout', 'amenity')),
  constraint guest_requests_status_check
    check (status in ('open', 'in_progress', 'resolved'))
);

create index if not exists guest_requests_trip_idx on public.guest_requests (trip_id, status);

-- ---------------------------------------------------------------------------
-- 6. Row level security
--    These mirror the app's current model: the mobile client talks to Supabase
--    with the anon key and no per-user auth on these tables. Tighten these
--    policies (e.g. scope to auth.uid() / a staff role) before going live.
-- ---------------------------------------------------------------------------
alter table public.digital_keys enable row level security;
alter table public.key_events enable row level security;
alter table public.guest_requests enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['digital_keys', 'key_events', 'guest_requests'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_anon_all', tbl);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      tbl || '_anon_all', tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Realtime — the staff dashboard subscribes to these
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array['rooms', 'assignments', 'guests', 'digital_keys', 'guest_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

-- Realtime payloads need the full old row for deletes/updates.
alter table public.rooms replica identity full;
alter table public.assignments replica identity full;
alter table public.digital_keys replica identity full;

-- ---------------------------------------------------------------------------
-- 8. Storage bucket for room photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

drop policy if exists "room photos readable" on storage.objects;
create policy "room photos readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'room-photos');

drop policy if exists "room photos writable" on storage.objects;
create policy "room photos writable" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'room-photos');

drop policy if exists "room photos deletable" on storage.objects;
create policy "room photos deletable" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'room-photos');

-- ---------------------------------------------------------------------------
-- 9. Keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at before update on public.rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists assignments_touch_updated_at on public.assignments;
create trigger assignments_touch_updated_at before update on public.assignments
  for each row execute function public.touch_updated_at();

drop trigger if exists digital_keys_touch_updated_at on public.digital_keys;
create trigger digital_keys_touch_updated_at before update on public.digital_keys
  for each row execute function public.touch_updated_at();
