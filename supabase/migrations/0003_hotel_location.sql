-- GroupStay — Property location details
--
-- Run after 0002_rbac.sql. Idempotent, so re-running is safe.
--
-- Hotel staff need to see which property they are working in at a glance —
-- chains have several sites and a group block can move between them. This adds
-- the location fields and lets staff maintain them from inside the app.

-- ---------------------------------------------------------------------------
-- 1. Location columns (hotels.address already exists from 0002)
-- ---------------------------------------------------------------------------
alter table public.hotels add column if not exists city text;
alter table public.hotels add column if not exists region text;
alter table public.hotels add column if not exists postal_code text;
alter table public.hotels add column if not exists phone text;
alter table public.hotels add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Staff may maintain their own property's details — and only their own.
-- ---------------------------------------------------------------------------
drop policy if exists hotels_update on public.hotels;
create policy hotels_update on public.hotels
  for update to authenticated
  using (public.app_is_admin() or (public.app_role() = 'hotel_staff' and id = public.app_hotel_id()))
  with check (public.app_is_admin() or (public.app_role() = 'hotel_staff' and id = public.app_hotel_id()));

-- ---------------------------------------------------------------------------
-- 3. claim_hotel now captures the location up front.
--    The old two-argument version is dropped so the name isn't overloaded.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_hotel(text, text);

create or replace function public.claim_hotel(
  p_name text,
  p_code text default null,
  p_address text default null,
  p_city text default null,
  p_region text default null,
  p_postal_code text default null,
  p_phone text default null
) returns uuid language plpgsql security definer set search_path = public as $$
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
    insert into public.hotels (name, code, address, city, region, postal_code, phone)
    values (trim(p_name), v_code, nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
            nullif(trim(coalesce(p_region, '')), ''), nullif(trim(coalesce(p_postal_code, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''))
    returning id into v_hotel;
  else
    -- Joining an existing property: fill in any blanks, never overwrite.
    update public.hotels
    set address = coalesce(address, nullif(trim(coalesce(p_address, '')), '')),
        city = coalesce(city, nullif(trim(coalesce(p_city, '')), '')),
        region = coalesce(region, nullif(trim(coalesce(p_region, '')), '')),
        postal_code = coalesce(postal_code, nullif(trim(coalesce(p_postal_code, '')), '')),
        phone = coalesce(phone, nullif(trim(coalesce(p_phone, '')), '')),
        updated_at = now()
    where id = v_hotel;
  end if;

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set hotel_id = v_hotel, updated_at = now() where id = auth.uid();
  perform set_config('app.bypass_profile_guard', 'off', true);

  return v_hotel;
end $$;

revoke all on function public.claim_hotel(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_hotel(text, text, text, text, text, text, text) to authenticated;
