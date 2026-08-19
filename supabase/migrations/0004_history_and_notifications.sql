-- GroupStay — Assignment history and push notifications
--
-- Run after 0003_hotel_location.sql. Idempotent.
--
-- Two additions:
--   1. A permanent, append-only record of every room assignment change, so
--      "who moved Sarah to 318, when, and why" always has an answer.
--   2. Device registration and a notification log, so the app can push the
--      eleven events staff and guests care about.

-- ---------------------------------------------------------------------------
-- 1. Assignment history
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  from_room_id uuid references public.rooms (id) on delete set null,
  to_room_id uuid references public.rooms (id) on delete set null,
  action text not null,
  reason text,
  -- Captured at write time: the actor's profile may later change role, and the
  -- history must still read the way it did when it happened.
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  actor_role text,
  created_at timestamptz not null default now(),
  constraint assignment_events_action_check
    check (action in ('assigned', 'moved', 'unassigned', 'checked_in', 'checked_out', 'key_issued', 'key_moved', 'key_revoked', 'key_expired'))
);

create index if not exists assignment_events_room_idx on public.assignment_events (to_room_id, created_at desc);
create index if not exists assignment_events_guest_idx on public.assignment_events (guest_id, created_at desc);
create index if not exists assignment_events_trip_idx on public.assignment_events (trip_id, created_at desc);

/**
 * Record assignment changes automatically. A trigger rather than app-side
 * logging, so a history entry cannot be skipped by a code path that forgot —
 * including bulk auto-assign and anything run straight from the SQL editor.
 */
create or replace function public.log_assignment_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
  v_role text;
  v_action text;
  v_from uuid;
begin
  select p.full_name, p.role into v_name, v_role from public.profiles p where p.id = v_actor;

  if tg_op = 'INSERT' then
    v_action := case when new.status = 'checked_in' then 'checked_in' else 'assigned' end;
    v_from := null;
  elsif tg_op = 'UPDATE' then
    if new.room_id is distinct from old.room_id then
      v_action := case when new.room_id is null then 'unassigned' else 'moved' end;
      v_from := old.room_id;
    elsif new.status is distinct from old.status and new.status = 'checked_in' then
      v_action := 'checked_in';
      v_from := old.room_id;
    elsif new.status is distinct from old.status and new.status = 'checked_out' then
      v_action := 'checked_out';
      v_from := old.room_id;
    else
      return new; -- date edits and similar are not assignment history
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.assignment_events (trip_id, guest_id, from_room_id, to_room_id, action, reason, actor_id, actor_name, actor_role)
    values (old.trip_id, old.guest_id, old.room_id, null, 'unassigned',
            nullif(current_setting('app.change_reason', true), ''), v_actor, v_name, v_role);
    return old;
  end if;

  insert into public.assignment_events (trip_id, guest_id, from_room_id, to_room_id, action, reason, actor_id, actor_name, actor_role)
  values (new.trip_id, new.guest_id, v_from, new.room_id, v_action,
          nullif(current_setting('app.change_reason', true), ''), v_actor, v_name, v_role);

  return new;
end $$;

drop trigger if exists assignments_history on public.assignments;
create trigger assignments_history
  after insert or update or delete on public.assignments
  for each row execute function public.log_assignment_event();

/** Attach a reason to the next write in this transaction. */
create or replace function public.set_change_reason(p_reason text)
returns void language sql volatile as $$
  select set_config('app.change_reason', coalesce(p_reason, ''), true);
$$;

/**
 * Put a guest back where they were. Reads the last move out of history rather
 * than trusting a room id supplied by the client.
 */
create or replace function public.restore_assignment(p_guest uuid, p_reason text default 'Restored previous assignment')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event public.assignment_events%rowtype;
  v_trip uuid;
begin
  select * into v_event
  from public.assignment_events
  where guest_id = p_guest and action in ('moved', 'unassigned') and from_room_id is not null
  order by created_at desc
  limit 1;

  if v_event.id is null then raise exception 'No previous room to restore'; end if;
  if not public.app_can_manage_trip(v_event.trip_id) then raise exception 'Not allowed'; end if;

  select trip_id into v_trip from public.guests where id = p_guest;

  perform set_config('app.change_reason', p_reason, true);

  insert into public.assignments (trip_id, guest_id, room_id, status)
  values (coalesce(v_trip, v_event.trip_id), p_guest, v_event.from_room_id, 'reserved')
  on conflict (guest_id) do update set room_id = excluded.room_id;

  update public.digital_keys set room_id = v_event.from_room_id
  where guest_id = p_guest and status = 'active';

  return v_event.from_room_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Push notifications
-- ---------------------------------------------------------------------------
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  guest_id uuid references public.guests (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in (
    'room_assigned', 'room_changed', 'check_in_reminder', 'check_in_complete',
    'room_ready', 'key_issued', 'key_expiring', 'room_request',
    'maintenance_update', 'announcement', 'checkout_reminder'
  ))
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unsent_idx on public.notifications (sent_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
alter table public.assignment_events enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notifications enable row level security;

drop policy if exists assignment_events_select on public.assignment_events;
create policy assignment_events_select on public.assignment_events
  for select to authenticated using (
    case public.app_role()
      when 'student' then guest_id = public.app_guest_id()
      else public.app_can_see_trip(trip_id)
    end
  );

-- Written by the trigger (SECURITY DEFINER); never by a client directly.
drop policy if exists assignment_events_insert on public.assignment_events;
create policy assignment_events_insert on public.assignment_events
  for insert to authenticated with check (public.app_can_manage_trip(trip_id));

drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (
    user_id = auth.uid()
    or guest_id = public.app_guest_id()
    or (public.app_role() in ('hotel_staff', 'admin') and public.app_can_see_trip(trip_id))
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated with check (
    public.app_role() in ('hotel_staff', 'chapter_assignor', 'admin')
    or user_id = auth.uid()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid() or guest_id = public.app_guest_id())
  with check (user_id = auth.uid() or guest_id = public.app_guest_id());

revoke all on public.assignment_events, public.device_tokens, public.notifications from anon;

grant execute on function public.set_change_reason(text) to authenticated;
grant execute on function public.restore_assignment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.assignment_events;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null; end;
  end if;
end $$;
