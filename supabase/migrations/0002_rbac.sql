-- GroupStay — Role-based access control and data isolation
--
-- Run AFTER 0001_hotel_platform.sql, in the Supabase SQL editor.
-- Idempotent: safe to re-run.
--
-- Roles
--   hotel_staff       -> only their own hotel's rooms, guests, reservations, keys
--   chapter_assignor  -> only their own chapter's students and assignments
--   student           -> only their own reservation + the occupants of their room
--   admin             -> everything
--
-- Enforcement lives in Postgres row level security, not in the app. The mobile
-- client talks to PostgREST with the public anon key, so any check that only
-- existed in JavaScript could be bypassed by crafting a request by hand. Every
-- policy below is evaluated on the server against auth.uid().

-- ---------------------------------------------------------------------------
-- 1. Organizations
-- ---------------------------------------------------------------------------
create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  school text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Profiles — the single source of truth for "who is this and what may they see"
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student',
  full_name text,
  email text,
  hotel_id uuid references public.hotels (id) on delete set null,
  chapter_id uuid references public.chapters (id) on delete set null,
  guest_id uuid references public.guests (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check
    check (role in ('hotel_staff', 'chapter_assignor', 'student', 'admin'))
);

create index if not exists profiles_hotel_idx on public.profiles (hotel_id);
create index if not exists profiles_chapter_idx on public.profiles (chapter_id);

-- New auth users get a profile automatically, with the role they picked at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  raw_role text := coalesce(new.raw_user_meta_data ->> 'role', 'Student');
  mapped_role text;
begin
  mapped_role := case lower(raw_role)
    when 'hotel staff' then 'hotel_staff'
    when 'hotel_staff' then 'hotel_staff'
    when 'advisor' then 'chapter_assignor'
    when 'chapter assignor' then 'chapter_assignor'
    when 'chapter_assignor' then 'chapter_assignor'
    when 'admin' then 'admin'
    else 'student'
  end;

  insert into public.profiles (id, role, full_name, email)
  values (new.id, mapped_role, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this migration.
insert into public.profiles (id, role, full_name, email)
select u.id,
       case lower(coalesce(u.raw_user_meta_data ->> 'role', 'Student'))
         when 'hotel staff' then 'hotel_staff'
         when 'advisor' then 'chapter_assignor'
         when 'admin' then 'admin'
         else 'student'
       end,
       u.raw_user_meta_data ->> 'full_name',
       u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Scope columns on existing tables
-- ---------------------------------------------------------------------------
alter table public.trips add column if not exists hotel_id uuid references public.hotels (id) on delete set null;
alter table public.trips add column if not exists chapter_id uuid references public.chapters (id) on delete set null;
alter table public.guests add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists trips_hotel_idx on public.trips (hotel_id);
create index if not exists trips_chapter_idx on public.trips (chapter_id);
create unique index if not exists guests_user_id_idx on public.guests (user_id) where user_id is not null;

-- Backfill: turn the free-text hotel_name / school columns into real orgs.
insert into public.hotels (name, code)
select distinct t.hotel_name,
       upper(regexp_replace(t.hotel_name, '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(t.hotel_name), 1, 4)
from public.trips t
where t.hotel_name is not null
  and not exists (select 1 from public.hotels h where h.name = t.hotel_name)
on conflict (code) do nothing;

update public.trips t
set hotel_id = h.id
from public.hotels h
where t.hotel_id is null and h.name = t.hotel_name;

insert into public.chapters (name, code, school)
select distinct g.school,
       upper(regexp_replace(g.school, '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(g.school), 1, 4),
       g.school
from public.guests g
where g.school is not null and g.school <> ''
  and not exists (select 1 from public.chapters c where c.name = g.school)
on conflict (code) do nothing;

-- Point each trip at the chapter most of its guests belong to.
update public.trips t
set chapter_id = sub.chapter_id
from (
  select g.trip_id, c.id as chapter_id,
         row_number() over (partition by g.trip_id order by count(*) desc) as rn
  from public.guests g
  join public.chapters c on c.name = g.school
  group by g.trip_id, c.id
) sub
where sub.trip_id = t.id and sub.rn = 1 and t.chapter_id is null;

-- ---------------------------------------------------------------------------
-- 4. Scope helpers
--    SECURITY DEFINER so a policy can read profiles without recursing into
--    the policies on profiles itself.
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_hotel_id()
returns uuid language sql stable security definer set search_path = public as $$
  select hotel_id from public.profiles where id = auth.uid()
$$;

create or replace function public.app_chapter_id()
returns uuid language sql stable security definer set search_path = public as $$
  select chapter_id from public.profiles where id = auth.uid()
$$;

create or replace function public.app_guest_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select guest_id from public.profiles where id = auth.uid()),
    (select id from public.guests where user_id = auth.uid() limit 1)
  )
$$;

create or replace function public.app_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

/** The room the signed-in student is assigned to (null for everyone else). */
create or replace function public.app_room_id()
returns uuid language sql stable security definer set search_path = public as $$
  select a.room_id
  from public.assignments a
  where a.guest_id = public.app_guest_id()
    and a.status in ('reserved', 'checked_in')
  limit 1
$$;

/** Central visibility rule for a trip, used by every child table. */
create or replace function public.app_can_see_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.app_role()
    when 'admin' then true
    when 'hotel_staff' then exists (
      select 1 from public.trips t
      where t.id = p_trip and t.hotel_id is not null and t.hotel_id = public.app_hotel_id()
    )
    when 'chapter_assignor' then exists (
      select 1 from public.trips t
      where t.id = p_trip and t.chapter_id is not null and t.chapter_id = public.app_chapter_id()
    )
    when 'student' then exists (
      select 1 from public.guests g
      where g.id = public.app_guest_id() and g.trip_id = p_trip
    )
    else false
  end
$$;

/** Can the caller *manage* (write to) this trip's rooms/reservations? */
create or replace function public.app_can_manage_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_role() in ('admin', 'hotel_staff', 'chapter_assignor')
     and public.app_can_see_trip(p_trip)
$$;

/** True when the given guest shares a room with the signed-in student. */
create or replace function public.app_shares_room_with(p_guest uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_room_id() is not null
     and exists (
       select 1 from public.assignments a
       where a.guest_id = p_guest
         and a.room_id = public.app_room_id()
         and a.status in ('reserved', 'checked_in')
     )
$$;

-- ---------------------------------------------------------------------------
-- 5. Drop the wide-open policies from 0001 and lock every table down
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('trips', 'rooms', 'guests', 'assignments', 'digital_keys',
                        'key_events', 'guest_requests', 'messages', 'hotels', 'chapters', 'profiles')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['trips', 'rooms', 'guests', 'assignments', 'digital_keys',
                             'key_events', 'guest_requests', 'hotels', 'chapters', 'profiles'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
  end loop;

  if to_regclass('public.messages') is not null then
    execute 'alter table public.messages enable row level security';
  end if;
end $$;

-- --- Organizations: readable by any signed-in user (needed to pick one at signup),
--     writable only through the claim_* functions below. ----------------------
create policy hotels_select on public.hotels
  for select to authenticated using (true);

create policy chapters_select on public.chapters
  for select to authenticated using (true);

-- --- Profiles: you can read and edit only your own row, and you cannot
--     promote yourself — the trigger below pins role/scope. -------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.app_is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid() or public.app_is_admin())
  with check (id = auth.uid() or public.app_is_admin());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

/**
 * Privilege escalation guard: a user may edit their display name, but role,
 * hotel_id, chapter_id and guest_id can only change via the SECURITY DEFINER
 * claim_* / join_trip functions (which set app.bypass_profile_guard) or by an
 * admin.
 */
create or replace function public.guard_profile_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.bypass_profile_guard', true), 'off') = 'on' then
    return new;
  end if;
  if public.app_is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.hotel_id is distinct from old.hotel_id
     or new.chapter_id is distinct from old.chapter_id
     or new.guest_id is distinct from old.guest_id then
    raise exception 'Role and organization cannot be changed directly';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_scope on public.profiles;
create trigger profiles_guard_scope before update on public.profiles
  for each row execute function public.guard_profile_scope();

-- --- Trips --------------------------------------------------------------
create policy trips_select on public.trips
  for select to authenticated using (public.app_can_see_trip(id));

create policy trips_insert on public.trips
  for insert to authenticated
  with check (
    public.app_is_admin()
    or (public.app_role() = 'chapter_assignor' and chapter_id = public.app_chapter_id())
    or (public.app_role() = 'hotel_staff' and hotel_id = public.app_hotel_id())
  );

create policy trips_update on public.trips
  for update to authenticated
  using (public.app_can_manage_trip(id))
  with check (public.app_can_manage_trip(id));

create policy trips_delete on public.trips
  for delete to authenticated
  using (public.app_is_admin() or (public.app_role() = 'chapter_assignor' and chapter_id = public.app_chapter_id()));

-- --- Rooms: the hotel owns its inventory. Assignors get read-only visibility
--     of the block their chapter is staying in. A student sees only their own
--     room, never the rest of the property. --------------------------------
create policy rooms_select on public.rooms
  for select to authenticated using (
    case public.app_role()
      when 'student' then id = public.app_room_id()
      else public.app_can_see_trip(trip_id)
    end
  );

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)));

create policy rooms_update on public.rooms
  for update to authenticated
  using (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)))
  with check (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)));

create policy rooms_delete on public.rooms
  for delete to authenticated
  using (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)));

-- --- Guests: students see themselves and their roommates, nobody else ------
create policy guests_select on public.guests
  for select to authenticated using (
    case public.app_role()
      when 'student' then id = public.app_guest_id() or public.app_shares_room_with(id)
      else public.app_can_see_trip(trip_id)
    end
  );

create policy guests_insert on public.guests
  for insert to authenticated
  with check (
    public.app_is_admin()
    or (public.app_role() in ('hotel_staff', 'chapter_assignor') and public.app_can_see_trip(trip_id))
    or (public.app_role() = 'student' and user_id = auth.uid())
  );

create policy guests_update on public.guests
  for update to authenticated
  using (
    public.app_is_admin()
    or (public.app_role() in ('hotel_staff', 'chapter_assignor') and public.app_can_see_trip(trip_id))
    or (public.app_role() = 'student' and id = public.app_guest_id())
  )
  with check (
    public.app_is_admin()
    or (public.app_role() in ('hotel_staff', 'chapter_assignor') and public.app_can_see_trip(trip_id))
    or (public.app_role() = 'student' and id = public.app_guest_id())
  );

create policy guests_delete on public.guests
  for delete to authenticated
  using (public.app_is_admin() or (public.app_role() = 'chapter_assignor' and public.app_can_see_trip(trip_id)));

-- --- Assignments: students may read the reservations in their own room (that
--     is how they see their roommates) but may never write one. -------------
create policy assignments_select on public.assignments
  for select to authenticated using (
    case public.app_role()
      when 'student' then guest_id = public.app_guest_id() or room_id = public.app_room_id()
      else public.app_can_see_trip(trip_id)
    end
  );

create policy assignments_write on public.assignments
  for insert to authenticated with check (public.app_can_manage_trip(trip_id));

create policy assignments_update on public.assignments
  for update to authenticated
  using (public.app_can_manage_trip(trip_id))
  with check (public.app_can_manage_trip(trip_id));

create policy assignments_delete on public.assignments
  for delete to authenticated using (public.app_can_manage_trip(trip_id));

-- --- Digital keys: the guest who owns the key, and the hotel that issued it.
--     Chapter assignors deliberately get no access to key material. ---------
create policy digital_keys_select on public.digital_keys
  for select to authenticated using (
    public.app_is_admin()
    or guest_id = public.app_guest_id()
    or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id))
  );

create policy digital_keys_insert on public.digital_keys
  for insert to authenticated
  with check (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)));

create policy digital_keys_update on public.digital_keys
  for update to authenticated
  using (
    public.app_is_admin()
    or guest_id = public.app_guest_id()
    or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id))
  )
  with check (
    public.app_is_admin()
    or guest_id = public.app_guest_id()
    or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id))
  );

create policy key_events_select on public.key_events
  for select to authenticated using (
    exists (select 1 from public.digital_keys k where k.id = key_id)
  );

create policy key_events_insert on public.key_events
  for insert to authenticated with check (
    exists (select 1 from public.digital_keys k where k.id = key_id)
  );

-- --- Guest requests -------------------------------------------------------
create policy guest_requests_select on public.guest_requests
  for select to authenticated using (
    public.app_is_admin()
    or guest_id = public.app_guest_id()
    or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id))
  );

create policy guest_requests_insert on public.guest_requests
  for insert to authenticated with check (
    guest_id = public.app_guest_id()
    or (public.app_role() in ('hotel_staff', 'admin') and public.app_can_see_trip(trip_id))
  );

create policy guest_requests_update on public.guest_requests
  for update to authenticated
  using (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)))
  with check (public.app_is_admin() or (public.app_role() = 'hotel_staff' and public.app_can_see_trip(trip_id)));

-- --- Messages (optional table from the original app) -----------------------
do $$
begin
  if to_regclass('public.messages') is not null then
    execute $p$
      create policy messages_select on public.messages
        for select to authenticated using (public.app_can_see_trip(trip_id))
    $p$;
    execute $p$
      create policy messages_insert on public.messages
        for insert to authenticated with check (public.app_can_see_trip(trip_id))
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Onboarding RPCs
--    These are the only way to attach a user to an organization, so a client
--    cannot simply UPDATE its own profile to point at someone else's hotel.
-- ---------------------------------------------------------------------------
create or replace function public.claim_hotel(p_name text, p_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hotel uuid;
  v_code text := upper(coalesce(nullif(trim(p_code), ''), substr(md5(p_name || clock_timestamp()::text), 1, 6)));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.app_role() not in ('hotel_staff', 'admin') then
    raise exception 'Only hotel staff can claim a hotel';
  end if;

  select id into v_hotel from public.hotels where code = v_code;
  if v_hotel is null then
    insert into public.hotels (name, code) values (trim(p_name), v_code) returning id into v_hotel;
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set hotel_id = v_hotel, updated_at = now() where id = auth.uid();
  perform set_config('app.bypass_profile_guard', 'off', true);

  return v_hotel;
end $$;

create or replace function public.claim_chapter(p_name text, p_code text default null, p_school text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_code text := upper(coalesce(nullif(trim(p_code), ''), substr(md5(p_name || clock_timestamp()::text), 1, 6)));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.app_role() not in ('chapter_assignor', 'admin') then
    raise exception 'Only chapter assignors can claim a chapter';
  end if;

  select id into v_chapter from public.chapters where code = v_code;
  if v_chapter is null then
    insert into public.chapters (name, code, school)
    values (trim(p_name), v_code, coalesce(p_school, trim(p_name)))
    returning id into v_chapter;
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set chapter_id = v_chapter, updated_at = now() where id = auth.uid();
  perform set_config('app.bypass_profile_guard', 'off', true);

  return v_chapter;
end $$;

/**
 * A student joins a trip with its code. Knowing the code is the grant — the
 * student never gets SELECT on trips they aren't in, so codes can't be
 * enumerated by listing the table.
 */
create or replace function public.join_trip(
  p_trip_code text,
  p_legal_name text,
  p_email text default null,
  p_phone text default null,
  p_school text default null,
  p_arrival_window text default null,
  p_is_chaperone boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips%rowtype;
  v_guest uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_trip from public.trips where upper(trip_code) = upper(trim(p_trip_code));
  if v_trip.id is null then raise exception 'Trip not found — check your code'; end if;

  select id into v_guest from public.guests where user_id = auth.uid() and trip_id = v_trip.id;

  if v_guest is null then
    insert into public.guests (trip_id, legal_name, email, phone, school, arrival_window, is_chaperone, user_id)
    values (v_trip.id, p_legal_name, p_email, p_phone, coalesce(p_school, ''), p_arrival_window, coalesce(p_is_chaperone, false), auth.uid())
    returning id into v_guest;
  else
    update public.guests
    set legal_name = p_legal_name,
        email = coalesce(p_email, email),
        phone = coalesce(p_phone, phone),
        school = coalesce(p_school, school),
        arrival_window = coalesce(p_arrival_window, arrival_window),
        is_chaperone = coalesce(p_is_chaperone, is_chaperone)
    where id = v_guest;
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set guest_id = v_guest, updated_at = now() where id = auth.uid();
  perform set_config('app.bypass_profile_guard', 'off', true);

  return v_guest;
end $$;

/** Look up the trip a student has joined, without granting table-wide SELECT. */
create or replace function public.my_trip()
returns table (id uuid, name text, hotel_name text, trip_code text, check_in date, check_out date)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.hotel_name, t.trip_code, t.check_in, t.check_out
  from public.trips t
  join public.guests g on g.trip_id = t.id
  where g.id = public.app_guest_id()
$$;

/**
 * Share a room key with someone already assigned to the same room. Validates
 * the relationship server-side so a student can't mint a key for another room.
 */
create or replace function public.share_room_key(p_target_guest uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.app_guest_id();
  v_room uuid := public.app_room_id();
  v_key public.digital_keys%rowtype;
  v_new uuid;
begin
  if v_me is null or v_room is null then raise exception 'You do not have a room yet'; end if;
  if not public.app_shares_room_with(p_target_guest) then
    raise exception 'That guest is not in your room';
  end if;

  select * into v_key from public.digital_keys
  where guest_id = v_me and room_id = v_room and status = 'active'
  order by created_at desc limit 1;

  if v_key.id is null then raise exception 'You do not have an active key to share'; end if;

  insert into public.digital_keys (trip_id, guest_id, room_id, key_token, pass_serial, status, valid_from, valid_until, shared_by, activated_at)
  values (
    v_key.trip_id, p_target_guest, v_room,
    encode(gen_random_bytes(32), 'hex'),
    'GS-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
    'active', v_key.valid_from, v_key.valid_until, v_me, now()
  )
  on conflict (guest_id, room_id) where status = 'active' do nothing
  returning id into v_new;

  return v_new;
end $$;

-- Only signed-in users may call these.
revoke all on function public.claim_hotel(text, text) from public, anon;
revoke all on function public.claim_chapter(text, text, text) from public, anon;
revoke all on function public.join_trip(text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.my_trip() from public, anon;
revoke all on function public.share_room_key(uuid) from public, anon;

grant execute on function public.claim_hotel(text, text) to authenticated;
grant execute on function public.claim_chapter(text, text, text) to authenticated;
grant execute on function public.join_trip(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.my_trip() to authenticated;
grant execute on function public.share_room_key(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Revoke the anonymous grants entirely — nothing is readable signed out
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array['trips', 'rooms', 'guests', 'assignments', 'digital_keys',
                             'key_events', 'guest_requests', 'hotels', 'chapters', 'profiles'] loop
    execute format('revoke all on public.%I from anon', tbl);
  end loop;

  if to_regclass('public.messages') is not null then
    execute 'revoke all on public.messages from anon';
  end if;
end $$;

-- Room photos stay readable (they're just marketing images), but only signed-in
-- users may upload or delete them.
drop policy if exists "room photos writable" on storage.objects;
create policy "room photos writable" on storage.objects
  for insert to authenticated with check (bucket_id = 'room-photos');

drop policy if exists "room photos deletable" on storage.objects;
create policy "room photos deletable" on storage.objects
  for delete to authenticated using (bucket_id = 'room-photos');
