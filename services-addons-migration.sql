-- ============================================================================
-- Services manager + add-ons + staff reschedule. NOT APPLIED.
-- Target: Supabase project tzopofqahgenotfxkyzf (Postgres 17).
-- Prereq: guest-booking-migration.sql PARTS 0-5 (all live as of 2026-10-12).
--
-- Backward compatible: request_booking keeps every old argument; the new
-- p_addon_ids defaults to null, so the deployed frontend (12 named args) keeps
-- working. The old 12-arg signature is dropped in the same transaction so
-- PostgREST never sees two candidates.
-- No limit on how many add-ons per booking: ids are deduped, each must belong
-- to the tenant and be active; price and duration are summed server-side.
-- bookings.duration_min always holds the FULL job length (service + add-ons),
-- so availability, overlap checks and the Schedule timeline all block it.
--
-- Deploy order:
--   1. Run this whole file, SECTIONS 1-6, as one transaction (owner approved
--      section 6, Juan's add-on move, on 2026-10-12).
--   2. Merge / deploy the frontend.
--
-- Tests: sql-tests/run.sh builds a local mock of the live schema in a
-- throwaway Postgres and applies this file. Never point it at the live DB.
-- ============================================================================
begin;

-- 1. services: owner-editable fields + sanity checks ---------------------------
alter table public.services add column if not exists description text;
alter table public.services drop constraint if exists services_name_len;
alter table public.services add constraint services_name_len check (length(btrim(name)) between 2 and 100);
alter table public.services drop constraint if exists services_desc_len;
alter table public.services add constraint services_desc_len check (description is null or length(description) <= 1000);
alter table public.services drop constraint if exists services_price_range;
alter table public.services add constraint services_price_range check (price_cents between 0 and 10000000);
alter table public.services drop constraint if exists services_duration_range;
alter table public.services add constraint services_duration_range check (duration_min between 15 and 720);

-- Hide inactive services from the public (owners still see them).
drop policy if exists "services are publicly readable" on public.services;
create policy "active services are publicly readable" on public.services
  for select using (active or (is_tenant_staff() and tenant_id = current_tenant_id()) or is_potentia_admin());
-- Past bookings reference services: forbid hard delete from the app (deactivate instead).
revoke delete, truncate on public.services from anon, authenticated;
revoke insert, update, delete, truncate on public.services from anon;

-- 2. add-on catalog ---------------------------------------------------------------
create table if not exists public.service_addons (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id),
  name               text not null check (length(btrim(name)) between 2 and 100),
  description        text check (description is null or length(description) <= 500),
  price_cents        int  not null check (price_cents between 0 and 1000000),
  extra_duration_min int  not null default 0 check (extra_duration_min between 0 and 480),
  active             boolean not null default true,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists service_addons_tenant_idx on public.service_addons (tenant_id, sort_order);
alter table public.service_addons enable row level security;
create policy "active addons are publicly readable" on public.service_addons
  for select using (active or (is_tenant_staff() and tenant_id = current_tenant_id()) or is_potentia_admin());
create policy "staff manage addons in their tenant" on public.service_addons
  for all using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "potentia_admin manages all addons" on public.service_addons
  for all using (is_potentia_admin()) with check (is_potentia_admin());
revoke all on public.service_addons from anon;
grant select on public.service_addons to anon;
revoke all on public.service_addons from authenticated;
grant select, insert, update on public.service_addons to authenticated;  -- RLS limits writes to the tenant's staff

-- 3. snapshot of add-ons on each booking (any number of rows per booking) -------
create table if not exists public.booking_addons (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id),
  addon_id           uuid references public.service_addons(id) on delete set null,
  name               text not null,
  price_cents        int  not null,
  extra_duration_min int  not null default 0,
  created_at         timestamptz not null default now(),
  unique (booking_id, addon_id)
);
create index if not exists booking_addons_booking_idx on public.booking_addons (booking_id);
alter table public.booking_addons enable row level security;
create policy "customers see own booking addons" on public.booking_addons
  for select using (exists (select 1 from public.bookings b where b.id = booking_id and b.profile_id = auth.uid()));
create policy "staff see booking addons in their tenant" on public.booking_addons
  for select using (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "potentia_admin sees all booking addons" on public.booking_addons
  for select using (is_potentia_admin());
-- Writes only through the functions below.
revoke all on public.booking_addons from anon, authenticated;
grant select on public.booking_addons to authenticated;

-- 4. staff functions ----------------------------------------------------------
-- All staff writes that change WHEN or HOW LONG a job runs go through these,
-- so every booking blocks its full length (service + add-ons) and two jobs
-- can't overlap. Each takes the same per-tenant-day advisory lock as
-- request_booking, then re-checks the slot.

-- 4a. Internal slot check (not callable by clients). Raises a staff-facing
-- message if the job doesn't fit: outside business hours / off the slot grid,
-- in the past (when p_allow_past is false), or overlapping another live
-- booking (excluding p_exclude_id), with the mobile travel buffer applied.
create or replace function public.assert_staff_slot(
  p_tenant_id uuid, p_date date, p_start time, p_total_min int, p_type text,
  p_exclude_id uuid, p_allow_past boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_t     public.tenants%rowtype;
  v_now   timestamp;
  v_open  int;
  v_close int;
  v_start int;
  v_end   int;
  v_half  numeric;
  v_cs    numeric;
  v_ce    numeric;
begin
  select * into v_t from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'Business not found.' using errcode = 'P0001'; end if;
  if p_date is null or p_start is null then
    raise exception 'Pick a date and start time.' using errcode = 'P0001';
  end if;
  v_open  := public.hm12_to_minutes(v_t.business_hours->>'start');
  v_close := public.hm12_to_minutes(v_t.business_hours->>'end');
  v_start := extract(hour from p_start)::int * 60 + extract(minute from p_start)::int;
  v_end   := v_start + p_total_min;
  if v_start < v_open or extract(second from p_start) <> 0
     or (v_start - v_open) % greatest(v_t.booking_granularity_min, 1) <> 0 then
    raise exception 'That start time is outside business hours.' using errcode = 'P0001';
  end if;
  if v_end > v_close then
    raise exception 'That job (% min) would run past closing. Pick an earlier time.', p_total_min using errcode = 'P0001';
  end if;
  if not p_allow_past then
    v_now := now() at time zone v_t.timezone;
    if p_date < v_now::date or (p_date = v_now::date
        and v_start < extract(hour from v_now)::int * 60 + extract(minute from v_now)::int) then
      raise exception 'That time has already passed.' using errcode = 'P0001';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_t.id::text || '|' || p_date::text, 0));

  v_half := v_t.mobile_travel_buffer_min / 2.0;
  v_cs := case when p_type = 'mobile' then v_start - v_half else v_start end;
  v_ce := case when p_type = 'mobile' then v_end + v_half else v_end end;
  if exists (
    select 1 from public.bookings b
     where b.tenant_id = v_t.id
       and b.booking_date = p_date
       and b.status not in ('declined', 'cancelled')
       and b.id is distinct from p_exclude_id
       and v_cs < (extract(hour from b.start_time) * 60 + extract(minute from b.start_time) + b.duration_min
                   + case when b.type = 'mobile' then v_half else 0 end)
       and v_ce > (extract(hour from b.start_time) * 60 + extract(minute from b.start_time)
                   - case when b.type = 'mobile' then v_half else 0 end)
  ) then
    raise exception 'That would overlap another booking (this job is % min). Pick another time.', p_total_min using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.assert_staff_slot(uuid, date, time, int, text, uuid, boolean) from public, anon, authenticated;

-- 4b. Set service + add-ons on an existing booking (Schedule editor).
-- Re-snapshots add-ons, recomputes price and FULL duration, and for live
-- (pending/approved) bookings rejects the change if the longer job would
-- collide with another booking or run past closing.
create or replace function public.set_booking_service_addons(
  p_booking_id uuid, p_service_id uuid, p_addon_ids uuid[] default null)
returns table (price_cents int, duration_min int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_s public.services%rowtype;
  v_ids uuid[];
  v_total int;
begin
  select * into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found or not (public.is_potentia_admin()
      or (public.is_tenant_staff() and v_b.tenant_id = public.current_tenant_id())) then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;
  -- the booking's current service is allowed even if since deactivated
  select * into v_s from public.services s
   where s.id = p_service_id and s.tenant_id = v_b.tenant_id and (s.active or s.id = v_b.service_id);
  if not found then raise exception 'That service isn''t available.' using errcode = 'P0001'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_addon_ids, '{}'::uuid[])) x where x is not null;
  -- add-ons already on the booking stay allowed even if since deactivated (keep snapshot)
  if (select count(*) from public.service_addons a where a.id = any(v_ids) and a.tenant_id = v_b.tenant_id
        and (a.active or exists (select 1 from public.booking_addons ba where ba.booking_id = v_b.id and ba.addon_id = a.id)))
     <> cardinality(v_ids) then
    raise exception 'One of those add-ons isn''t available.' using errcode = 'P0001';
  end if;

  delete from public.booking_addons ba where ba.booking_id = v_b.id and (ba.addon_id is null or ba.addon_id <> all(v_ids));
  insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
  select v_b.id, v_b.tenant_id, a.id, a.name, a.price_cents, a.extra_duration_min
    from public.service_addons a
   where a.id = any(v_ids)
     and not exists (select 1 from public.booking_addons ba where ba.booking_id = v_b.id and ba.addon_id = a.id);

  v_total := v_s.duration_min + coalesce((select sum(ba.extra_duration_min) from public.booking_addons ba where ba.booking_id = v_b.id), 0);
  if v_b.status in ('pending', 'approved') then
    -- same date/time, new length: past bookings may still be corrected
    perform public.assert_staff_slot(v_b.tenant_id, v_b.booking_date, v_b.start_time, v_total, v_b.type, v_b.id, true);
  end if;

  update public.bookings b
     set service_id   = v_s.id,
         updated_at   = now(),
         price_cents  = v_s.price_cents + coalesce((select sum(ba.price_cents) from public.booking_addons ba where ba.booking_id = b.id), 0),
         duration_min = v_total
   where b.id = v_b.id
  returning b.price_cents, b.duration_min into price_cents, duration_min;
  return next;
end;
$$;
revoke all on function public.set_booking_service_addons(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_booking_service_addons(uuid, uuid, uuid[]) to authenticated;

-- 4c. Staff "Add Booking" (phone/text customers) in ONE transaction:
-- customer (existing, or new with source 'staff'), vehicle, approved booking
-- and add-ons together, so a booking can't be left without its add-ons.
create or replace function public.create_manual_booking(
  p_tenant_id      uuid,
  p_service_id     uuid,
  p_booking_date   date,
  p_start_time     time,
  p_type           text,
  p_vehicle_label  text,
  p_profile_id     uuid default null,
  p_new_name       text default null,
  p_new_phone      text default null,
  p_staff_id       uuid default null,
  p_mobile_address text default null,
  p_addon_ids      uuid[] default null)
returns table (booking_id uuid, price_cents int, duration_min int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_s       public.services%rowtype;
  v_ids     uuid[];
  v_total   int;
  v_cents   int;
  v_profile uuid := p_profile_id;
  v_vehicle uuid;
  v_id      uuid;
  v_label   text := btrim(coalesce(p_vehicle_label, ''));
  v_addr    text := nullif(btrim(coalesce(p_mobile_address, '')), '');
  v_name    text := btrim(coalesce(p_new_name, ''));
begin
  if p_tenant_id is null or not (public.is_potentia_admin()
      or (public.is_tenant_staff() and p_tenant_id = public.current_tenant_id())) then
    raise exception 'Not allowed.' using errcode = 'P0001';
  end if;
  select * into v_s from public.services s where s.id = p_service_id and s.tenant_id = p_tenant_id and s.active;
  if not found then raise exception 'That service isn''t available.' using errcode = 'P0001'; end if;
  if p_type is null or p_type not in ('dropoff', 'mobile') then
    raise exception 'Choose drop-off or mobile.' using errcode = 'P0001';
  end if;
  if p_type = 'mobile' then
    if v_addr is null or length(v_addr) > 300 then raise exception 'Enter the address for mobile service.' using errcode = 'P0001'; end if;
  else
    v_addr := null;
  end if;
  if length(v_label) < 1 or length(v_label) > 100 then
    raise exception 'Enter their vehicle (e.g. 2021 Ford F-150).' using errcode = 'P0001';
  end if;
  if p_staff_id is not null and not exists (select 1 from public.profiles p where p.id = p_staff_id
      and p.tenant_id = p_tenant_id and p.role in ('business_owner', 'staff')) then
    raise exception 'Pick a detailer from this business.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_addon_ids, '{}'::uuid[])) x where x is not null;
  if (select count(*) from public.service_addons a where a.id = any(v_ids) and a.tenant_id = p_tenant_id and a.active)
     <> cardinality(v_ids) then
    raise exception 'One of those add-ons isn''t available.' using errcode = 'P0001';
  end if;
  v_total := v_s.duration_min + coalesce((select sum(a.extra_duration_min) from public.service_addons a where a.id = any(v_ids)), 0);
  v_cents := v_s.price_cents  + coalesce((select sum(a.price_cents) from public.service_addons a where a.id = any(v_ids)), 0);

  perform public.assert_staff_slot(p_tenant_id, p_booking_date, p_start_time, v_total, p_type, null, false);

  if v_profile is not null then
    if not exists (select 1 from public.profiles p where p.id = v_profile and p.tenant_id = p_tenant_id and p.role = 'customer') then
      raise exception 'Select a customer.' using errcode = 'P0001';
    end if;
  else
    if length(v_name) < 1 or length(v_name) > 100 then raise exception 'Enter the customer''s name.' using errcode = 'P0001'; end if;
    insert into public.profiles (tenant_id, full_name, phone, role, source)
    values (p_tenant_id, v_name, nullif(btrim(coalesce(p_new_phone, '')), ''), 'customer', 'staff')
    returning id into v_profile;
  end if;

  insert into public.vehicles (profile_id, tenant_id, label, is_primary)
  values (v_profile, p_tenant_id, v_label, true) returning id into v_vehicle;

  insert into public.bookings (profile_id, service_id, vehicle_id, staff_id, tenant_id, booking_date, start_time,
                               duration_min, type, mobile_address, status, price_cents)
  values (v_profile, v_s.id, v_vehicle, p_staff_id, p_tenant_id, p_booking_date, p_start_time,
          v_total, p_type, v_addr, 'approved', v_cents)
  returning id into v_id;

  insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
  select v_id, p_tenant_id, a.id, a.name, a.price_cents, a.extra_duration_min
    from public.service_addons a where a.id = any(v_ids);

  return query select v_id, v_cents, v_total;
end;
$$;
revoke all on function public.create_manual_booking(uuid, uuid, date, time, text, text, uuid, text, text, uuid, text, uuid[]) from public, anon;
grant execute on function public.create_manual_booking(uuid, uuid, date, time, text, text, uuid, text, text, uuid, text, uuid[]) to authenticated;

-- 4d. Staff reschedule (Schedule and Requests tabs). Moves a pending or
-- approved booking to a new date/start time; the FULL duration must fit in
-- business hours on the slot grid, not in the past, and not overlap any other
-- live booking (mobile buffer included). Status is left as-is.
create or replace function public.reschedule_booking(
  p_booking_id uuid, p_new_date date, p_new_start_time time)
returns table (booking_id uuid, booking_date date, start_time time, status text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
begin
  select * into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found or not (public.is_potentia_admin()
      or (public.is_tenant_staff() and v_b.tenant_id = public.current_tenant_id())) then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;
  if v_b.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved bookings can be rescheduled.' using errcode = 'P0001';
  end if;
  perform public.assert_staff_slot(v_b.tenant_id, p_new_date, p_new_start_time, v_b.duration_min, v_b.type, v_b.id, false);
  update public.bookings b
     set booking_date = p_new_date, start_time = p_new_start_time, updated_at = now()
   where b.id = v_b.id;
  return query select v_b.id, p_new_date, p_new_start_time, v_b.status;
end;
$$;
revoke all on function public.reschedule_booking(uuid, date, time) from public, anon;
grant execute on function public.reschedule_booking(uuid, date, time) to authenticated;

-- 5. request_booking with optional add-ons; duration_min stores the FULL job. Drop the 12-arg version first, or
-- PostgREST sees two candidates for a 12-named-arg call and errors.
drop function if exists public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text);
create or replace function public.request_booking(
  p_tenant_slug    text,
  p_service_id     uuid,
  p_booking_date   date,
  p_start_time     time,
  p_type           text,
  p_vehicle_label  text,
  p_vehicle_color  text default null,
  p_mobile_address text default null,
  p_guest_name     text default null,
  p_guest_phone    text default null,
  p_guest_email    text default null,
  p_guest_zip      text default null,
  p_addon_ids      uuid[] default null
)
returns table (booking_id uuid, booking_date date, start_time time, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_min_lead_min   constant int := 30;   -- keep in sync with MIN_LEAD_MIN in src/lib/time.js
  c_max_days_ahead constant int := 13;
  v_uid        uuid := auth.uid();
  v_tenant     public.tenants%rowtype;
  v_service    public.services%rowtype;
  v_addon_ids  uuid[];
  v_addon_price int := 0;
  v_addon_min  int := 0;
  v_total_min  int;
  v_total_cents int;
  v_caller     public.profiles%rowtype;
  v_is_guest   boolean := v_uid is null;
  v_profile_id uuid;
  v_vehicle_id uuid;
  v_booking_id uuid;
  v_now        timestamp;
  v_today      date;
  v_now_min    int;
  v_open       int;
  v_close      int;
  v_start      int;
  v_end        int;
  v_half       numeric;
  v_cs         numeric;
  v_ce         numeric;
  v_name       text;
  v_phone      text;
  v_email      text;
  v_zip        text;
  v_label      text := btrim(coalesce(p_vehicle_label, ''));
  v_color      text := nullif(btrim(coalesce(p_vehicle_color, '')), '');
  v_addr       text := nullif(btrim(coalesce(p_mobile_address, '')), '');
begin
  -- tenant + service ---------------------------------------------------------
  select * into v_tenant from public.tenants t
   where t.slug = p_tenant_slug and t.status in ('active', 'trial');
  if not found then raise exception 'This business isn''t taking online bookings.' using errcode = 'P0001'; end if;

  select * into v_service from public.services s
   where s.id = p_service_id and s.tenant_id = v_tenant.id and s.active;
  if not found then raise exception 'That service isn''t available.' using errcode = 'P0001'; end if;

  -- add-ons (optional; old frontend sends none) --------------------------------
  select coalesce(array_agg(distinct x), '{}') into v_addon_ids
    from unnest(coalesce(p_addon_ids, '{}'::uuid[])) x where x is not null;
  if cardinality(v_addon_ids) > 0 then
    if (select count(*) from public.service_addons a
         where a.id = any(v_addon_ids) and a.tenant_id = v_tenant.id and a.active) <> cardinality(v_addon_ids) then
      raise exception 'One of those add-ons isn''t available.' using errcode = 'P0001';
    end if;
    select coalesce(sum(a.price_cents), 0), coalesce(sum(a.extra_duration_min), 0)
      into v_addon_price, v_addon_min
      from public.service_addons a where a.id = any(v_addon_ids);
  end if;
  v_total_min   := v_service.duration_min + v_addon_min;
  v_total_cents := v_service.price_cents + v_addon_price;

  -- booking details ------------------------------------------------------------
  if p_type is null or p_type not in ('dropoff', 'mobile') then
    raise exception 'Choose drop-off or mobile.' using errcode = 'P0001';
  end if;
  if p_type = 'mobile' then
    if v_addr is null or length(v_addr) < 5 or length(v_addr) > 300 then
      raise exception 'Enter the address for mobile service.' using errcode = 'P0001';
    end if;
  else
    v_addr := null;
  end if;
  if length(v_label) < 2 or length(v_label) > 100 then
    raise exception 'Enter your vehicle (e.g. 2021 Ford F-150).' using errcode = 'P0001';
  end if;
  if v_color is not null and length(v_color) > 30 then
    raise exception 'Vehicle color is too long.' using errcode = 'P0001';
  end if;

  -- who is booking ---------------------------------------------------------------
  if not v_is_guest then
    select * into v_caller from public.profiles p where p.id = v_uid;
    if not found or v_caller.role <> 'customer' or v_caller.tenant_id is distinct from v_tenant.id then
      raise exception 'This account can''t book with this business.' using errcode = 'P0001';
    end if;
    v_profile_id := v_uid;
  else
    v_name := btrim(coalesce(p_guest_name, ''));
    if length(v_name) < 2 or length(v_name) > 100 then
      raise exception 'Enter your name.' using errcode = 'P0001';
    end if;
    v_phone := regexp_replace(coalesce(p_guest_phone, ''), '[^0-9]', '', 'g');
    if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
    if length(v_phone) <> 10 then
      raise exception 'Enter a 10-digit phone number.' using errcode = 'P0001';
    end if;
    v_email := nullif(lower(btrim(coalesce(p_guest_email, ''))), '');
    if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'Enter a valid email or leave it blank.' using errcode = 'P0001';
    end if;
    v_zip := nullif(btrim(coalesce(p_guest_zip, '')), '');
    if v_zip is not null and v_zip !~ '^[0-9]{5}$' then
      raise exception 'Enter a 5-digit ZIP code.' using errcode = 'P0001';
    end if;
    if p_type = 'mobile' and v_zip is null then
      raise exception 'Enter your ZIP code for mobile service.' using errcode = 'P0001';
    end if;
  end if;

  -- date / time rules, in the business's own timezone -------------------------------
  v_now     := now() at time zone v_tenant.timezone;
  v_today   := v_now::date;
  v_now_min := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  if p_booking_date is null or p_start_time is null
     or p_booking_date < v_today or p_booking_date > v_today + c_max_days_ahead then
    raise exception 'Pick a date in the next two weeks.' using errcode = 'P0001';
  end if;

  v_open  := public.hm12_to_minutes(v_tenant.business_hours->>'start');
  v_close := public.hm12_to_minutes(v_tenant.business_hours->>'end');
  v_start := extract(hour from p_start_time)::int * 60 + extract(minute from p_start_time)::int;
  v_end   := v_start + v_total_min;
  if v_start < v_open or v_end > v_close
     or extract(second from p_start_time) <> 0
     or (v_start - v_open) % greatest(v_tenant.booking_granularity_min, 1) <> 0 then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  if p_booking_date = v_today and v_start < v_now_min + c_min_lead_min then
    raise exception 'That time has already passed. Pick a later time.' using errcode = 'P0001';
  end if;

  -- serialize bookings for this tenant+day, then check overlap ------------------------
  perform pg_advisory_xact_lock(hashtextextended(v_tenant.id::text || '|' || p_booking_date::text, 0));

  v_half := v_tenant.mobile_travel_buffer_min / 2.0;
  v_cs := case when p_type = 'mobile' then v_start - v_half else v_start end;
  v_ce := case when p_type = 'mobile' then v_end + v_half else v_end end;
  if exists (
    select 1 from public.bookings b
     where b.tenant_id = v_tenant.id
       and b.booking_date = p_booking_date
       and b.status not in ('declined', 'cancelled')
       and v_cs < (extract(hour from b.start_time) * 60 + extract(minute from b.start_time) + b.duration_min
                   + case when b.type = 'mobile' then v_half else 0 end)
       and v_ce > (extract(hour from b.start_time) * 60 + extract(minute from b.start_time)
                   - case when b.type = 'mobile' then v_half else 0 end)
  ) then
    raise exception 'Sorry, that time was just taken. Pick another.' using errcode = 'P0001';
  end if;

  -- abuse caps ---------------------------------------------------------------------
  if v_is_guest then
    perform pg_advisory_xact_lock(hashtextextended(v_tenant.id::text || '|guest', 0));
    if (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and p.source = 'guest' and p.phone = v_phone
           and b.status = 'pending' and b.booking_date >= v_today) >= 2 then
      raise exception 'You already have requests waiting for approval. We''ll be in touch soon.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and p.source = 'guest'
           and b.created_at > now() - interval '1 hour') >= 10
       or (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and p.source = 'guest'
           and b.created_at > now() - interval '24 hours') >= 30 then
      raise exception 'We''re getting a lot of requests right now. Please call or text us to book.' using errcode = 'P0001';
    end if;

    insert into public.profiles (tenant_id, full_name, phone, email, zip, role, source)
    values (v_tenant.id, v_name, v_phone, v_email, v_zip, 'customer', 'guest')
    returning id into v_profile_id;
  else
    if (select count(*) from public.bookings b
         where b.profile_id = v_profile_id and b.status = 'pending' and b.booking_date >= v_today) >= 5 then
      raise exception 'You already have several requests waiting for approval.' using errcode = 'P0001';
    end if;
  end if;

  -- write ------------------------------------------------------------------------------
  insert into public.vehicles (profile_id, tenant_id, label, color, is_primary)
  values (v_profile_id, v_tenant.id, v_label, v_color, true)
  returning id into v_vehicle_id;

  insert into public.bookings (profile_id, service_id, vehicle_id, tenant_id, booking_date, start_time,
                               duration_min, type, mobile_address, status, price_cents)
  values (v_profile_id, v_service.id, v_vehicle_id, v_tenant.id, p_booking_date, p_start_time,
          v_total_min, p_type, v_addr, 'pending', v_total_cents)
  returning id into v_booking_id;

  insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
  select v_booking_id, v_tenant.id, a.id, a.name, a.price_cents, a.extra_duration_min
    from public.service_addons a where a.id = any(v_addon_ids);

  return query select v_booking_id, p_booking_date, p_start_time, 'pending'::text;
end;
$$;

revoke all on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text, uuid[]) from public;
grant execute on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text, uuid[]) to anon, authenticated;

-- 6. Juan's Auto Detailing: Headlight Restoration, Pet Hair Removal and Odor
-- Removal become add-ons (owner approved 2026-10-12). Copies each service's
-- current name/price/minutes into service_addons, then deactivates the
-- service row. Rows are NEVER deleted, so any booking that points at them
-- stays intact. Idempotent: re-running adds no duplicate add-ons.
-- SECTION6-BEGIN
insert into public.service_addons (tenant_id, name, description, price_cents, extra_duration_min, sort_order)
select s.tenant_id, s.name, s.description, s.price_cents, least(s.duration_min, 480),
       row_number() over (order by s.sort_order, s.name)
  from public.services s
  join public.tenants t on t.id = s.tenant_id
 where t.slug = 'juans-auto-detailing'
   and s.name in ('Headlight Restoration', 'Pet Hair Removal', 'Odor Removal')
   and not exists (select 1 from public.service_addons a where a.tenant_id = s.tenant_id and a.name = s.name);
update public.services s set active = false
  from public.tenants t
 where t.id = s.tenant_id and t.slug = 'juans-auto-detailing'
   and s.name in ('Headlight Restoration', 'Pet Hair Removal', 'Odor Removal')
   and s.active;
-- SECTION6-END

commit;
