-- ============================================================================
-- Multi-service booking. NOT APPLIED.
-- Target: Supabase project tzopofqahgenotfxkyzf (Postgres 17).
-- Prereq: guest-booking-migration.sql PARTS 0-5 and services-addons-migration.sql
-- sections 1-6 (all live as of 2026-10-12).
--
-- Replaces "one main service + add-ons" with "any number of services per
-- booking". Each booking gets one booking_services row per chosen service,
-- snapshotting name/price/minutes at booking time. bookings.service_id stays
-- the FIRST chosen service, bookings.price_cents the summed total and
-- bookings.duration_min the summed length, so availability, overlap checks,
-- reschedule_booking and everything that reads bookings keep working as-is.
--
-- Backward compatible:
--   * Nothing is dropped. service_addons / booking_addons stay, and existing
--     booking_addons rows (past bookings) are not touched; the app still shows
--     them. Past bookings get NO booking_services rows (unchanged); the app
--     falls back to services.name + booking_addons for those.
--   * request_booking / create_manual_booking keep every old argument
--     (incl. p_addon_ids) and add p_service_ids uuid[] default null, so the
--     currently deployed frontend's calls work unchanged. Old signatures are
--     dropped in the same transaction so PostgREST never sees two candidates.
--   * set_booking_service_addons (old frontend) still works and now also keeps
--     booking_services in sync.
--
-- Deploy order:
--   1. Run this whole file, SECTIONS 1-6, as one transaction.
--   2. Merge / deploy the frontend right after (section 6 deactivates Juan's
--      add-ons, so the OLD frontend can no longer book them as add-ons).
--   Never re-run services-addons-migration.sql afterwards: its section 6
--   would deactivate Juan's three services again.
--
-- Tests: sql-tests/run.sh (local throwaway Postgres only).
-- ============================================================================
begin;

-- 1. booking_services: one snapshot row per service on a booking -------------
create table if not exists public.booking_services (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id),
  service_id   uuid references public.services(id) on delete set null,
  name         text not null,
  price_cents  int  not null,
  duration_min int  not null,
  position     int  not null default 1,
  created_at   timestamptz not null default now(),
  unique (booking_id, service_id)
);
create index if not exists booking_services_booking_idx on public.booking_services (booking_id, position);
alter table public.booking_services enable row level security;
drop policy if exists "customers see own booking services" on public.booking_services;
create policy "customers see own booking services" on public.booking_services
  for select using (exists (select 1 from public.bookings b where b.id = booking_id and b.profile_id = auth.uid()));
drop policy if exists "staff see booking services in their tenant" on public.booking_services;
create policy "staff see booking services in their tenant" on public.booking_services
  for select using (is_tenant_staff() and tenant_id = current_tenant_id());
drop policy if exists "potentia_admin sees all booking services" on public.booking_services;
create policy "potentia_admin sees all booking services" on public.booking_services
  for select using (is_potentia_admin());
-- Writes only through the functions below.
revoke all on public.booking_services from anon, authenticated;
grant select on public.booking_services to authenticated;

-- 2. Internal: validate a service list (not callable by clients) ---------------
-- Dedupes keeping first-seen order, requires 1-10 services that belong to the
-- tenant and are active (or listed in p_keep_ids: services already on the
-- booking being edited, which stay allowed even if since deactivated).
create or replace function public.pick_booking_services(
  p_tenant_id uuid, p_service_ids uuid[], p_keep_ids uuid[] default null)
returns table (service_id uuid, name text, price_cents int, duration_min int, "position" int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(x order by o), '{}') into v_ids
    from (select u.x, min(u.o) o from unnest(coalesce(p_service_ids, '{}'::uuid[])) with ordinality u(x, o)
           where u.x is not null group by u.x) d;
  if cardinality(v_ids) = 0 then
    raise exception 'Pick at least one service.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) > 10 then
    raise exception 'Pick at most 10 services.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.services s where s.id = any(v_ids) and s.tenant_id = p_tenant_id
        and (s.active or s.id = any(coalesce(p_keep_ids, '{}'::uuid[])))) <> cardinality(v_ids) then
    raise exception 'That service isn''t available.' using errcode = 'P0001';
  end if;
  return query
    select s.id, s.name, s.price_cents, s.duration_min, array_position(v_ids, s.id)::int
      from public.services s where s.id = any(v_ids)
     order by array_position(v_ids, s.id);
end;
$$;
revoke all on function public.pick_booking_services(uuid, uuid[], uuid[]) from public, anon, authenticated;

-- 3. request_booking: any number of services (p_service_ids). Drop the 13-arg
-- version first so PostgREST never sees two candidates.
drop function if exists public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text, uuid[]);
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
  p_addon_ids      uuid[] default null,
  p_service_ids    uuid[] default null
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
  v_svc_ids    uuid[];
  v_svc_price  int;
  v_svc_min    int;
  v_first      uuid;
  v_svcs       jsonb;
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

  -- services: p_service_ids (new frontend, any number) or the single
  -- p_service_id (old frontend). Sums are taken server-side.
  v_svc_ids := case when cardinality(p_service_ids) > 0 then p_service_ids else array[p_service_id] end;
  select jsonb_agg(to_jsonb(x) order by x."position") into v_svcs from public.pick_booking_services(v_tenant.id, v_svc_ids) x;
  select sum(x.price_cents), sum(x.duration_min) into v_svc_price, v_svc_min from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int);
  select x.service_id into v_first from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int) order by x."position" limit 1;

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
  v_total_min   := v_svc_min + v_addon_min;
  v_total_cents := v_svc_price + v_addon_price;

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
  values (v_profile_id, v_first, v_vehicle_id, v_tenant.id, p_booking_date, p_start_time,
          v_total_min, p_type, v_addr, 'pending', v_total_cents)
  returning id into v_booking_id;

  insert into public.booking_services (booking_id, tenant_id, service_id, name, price_cents, duration_min, "position")
  select v_booking_id, v_tenant.id, x.service_id, x.name, x.price_cents, x.duration_min, x."position" from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int);

  insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
  select v_booking_id, v_tenant.id, a.id, a.name, a.price_cents, a.extra_duration_min
    from public.service_addons a where a.id = any(v_addon_ids);

  return query select v_booking_id, p_booking_date, p_start_time, 'pending'::text;
end;
$$;

revoke all on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text, uuid[], uuid[]) from public;
grant execute on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text, uuid[], uuid[]) to anon, authenticated;
-- 4. create_manual_booking: any number of services (p_service_ids).
drop function if exists public.create_manual_booking(uuid, uuid, date, time, text, text, uuid, text, text, uuid, text, uuid[]);
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
  p_addon_ids      uuid[] default null,
  p_service_ids    uuid[] default null)
returns table (booking_id uuid, price_cents int, duration_min int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_first   uuid;
  v_svcs    jsonb;
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
  select jsonb_agg(to_jsonb(x) order by x."position") into v_svcs from public.pick_booking_services(p_tenant_id,
    case when cardinality(p_service_ids) > 0 then p_service_ids else array[p_service_id] end) x;
  select x.service_id into v_first from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int) order by x."position" limit 1;
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
  v_total := (select sum(x.duration_min) from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int))::int + coalesce((select sum(a.extra_duration_min) from public.service_addons a where a.id = any(v_ids)), 0);
  v_cents := (select sum(x.price_cents) from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int))::int + coalesce((select sum(a.price_cents) from public.service_addons a where a.id = any(v_ids)), 0);

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
  values (v_profile, v_first, v_vehicle, p_staff_id, p_tenant_id, p_booking_date, p_start_time,
          v_total, p_type, v_addr, 'approved', v_cents)
  returning id into v_id;

  insert into public.booking_services (booking_id, tenant_id, service_id, name, price_cents, duration_min, "position")
  select v_id, p_tenant_id, x.service_id, x.name, x.price_cents, x.duration_min, x."position" from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int);

  insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
  select v_id, p_tenant_id, a.id, a.name, a.price_cents, a.extra_duration_min
    from public.service_addons a where a.id = any(v_ids);

  return query select v_id, v_cents, v_total;
end;
$$;
revoke all on function public.create_manual_booking(uuid, uuid, date, time, text, text, uuid, text, text, uuid, text, uuid[], uuid[]) from public, anon;grant execute on function public.create_manual_booking(uuid, uuid, date, time, text, text, uuid, text, text, uuid, text, uuid[], uuid[]) to authenticated;

-- 5. Staff: set the services on an existing booking (Schedule editor) -------
-- Replaces the booking's service list (re-snapshotting name/price/minutes),
-- recomputes price and FULL duration (services + any legacy add-ons still on
-- the booking), and for live (pending/approved) bookings rejects the change if
-- the new length would collide with another booking or run past closing.
-- Services already on the booking stay allowed even if since deactivated.
create or replace function public.set_booking_services(
  p_booking_id uuid, p_service_ids uuid[])
returns table (price_cents int, duration_min int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_b    public.bookings%rowtype;
  v_keep uuid[];
  v_svcs jsonb;
  v_total int;
  v_cents int;
begin
  select * into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found or not (public.is_potentia_admin()
      or (public.is_tenant_staff() and v_b.tenant_id = public.current_tenant_id())) then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;
  v_keep := array(select bs.service_id from public.booking_services bs where bs.booking_id = v_b.id and bs.service_id is not null)
            || v_b.service_id;
  select jsonb_agg(to_jsonb(x) order by x."position") into v_svcs
    from public.pick_booking_services(v_b.tenant_id, p_service_ids, v_keep) x;

  -- keep the original snapshot for services that stay on the booking
  delete from public.booking_services bs where bs.booking_id = v_b.id
     and (bs.service_id is null or bs.service_id not in
          (select x.service_id from jsonb_to_recordset(v_svcs) x(service_id uuid)));
  update public.booking_services bs set "position" = x."position"
    from jsonb_to_recordset(v_svcs) x(service_id uuid, "position" int)
   where bs.booking_id = v_b.id and bs.service_id = x.service_id;
  insert into public.booking_services (booking_id, tenant_id, service_id, name, price_cents, duration_min, "position")
  select v_b.id, v_b.tenant_id, x.service_id, x.name, x.price_cents, x.duration_min, x."position"
    from jsonb_to_recordset(v_svcs) x(service_id uuid, name text, price_cents int, duration_min int, "position" int)
   where not exists (select 1 from public.booking_services bs where bs.booking_id = v_b.id and bs.service_id = x.service_id);

  -- totals come from the snapshot rows (kept rows keep their booked price);
  -- an overlap/closing error here rolls back the row changes above
  v_total := (select sum(bs.duration_min) from public.booking_services bs where bs.booking_id = v_b.id)::int
           + coalesce((select sum(ba.extra_duration_min) from public.booking_addons ba where ba.booking_id = v_b.id), 0);
  v_cents := (select sum(bs.price_cents) from public.booking_services bs where bs.booking_id = v_b.id)::int
           + coalesce((select sum(ba.price_cents) from public.booking_addons ba where ba.booking_id = v_b.id), 0);
  if v_b.status in ('pending', 'approved') then
    perform public.assert_staff_slot(v_b.tenant_id, v_b.booking_date, v_b.start_time, v_total, v_b.type, v_b.id, true);
  end if;

  update public.bookings b
     set service_id   = (select x.service_id from jsonb_to_recordset(v_svcs) x(service_id uuid, "position" int) order by x."position" limit 1),
         updated_at   = now(),
         price_cents  = v_cents,
         duration_min = v_total
   where b.id = v_b.id
  returning b.price_cents, b.duration_min into price_cents, duration_min;
  return next;
end;
$$;
revoke all on function public.set_booking_services(uuid, uuid[]) from public, anon;
grant execute on function public.set_booking_services(uuid, uuid[]) to authenticated;

-- Old frontend's editor (one service + add-ons) keeps working and now also
-- resets booking_services to that one service, so the two never disagree.
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

  -- keep booking_services in step with the single service chosen here
  delete from public.booking_services bs where bs.booking_id = v_b.id and bs.service_id is distinct from v_s.id;
  insert into public.booking_services (booking_id, tenant_id, service_id, name, price_cents, duration_min, "position")
  select v_b.id, v_b.tenant_id, v_s.id, v_s.name, v_s.price_cents, v_s.duration_min, 1
   where not exists (select 1 from public.booking_services bs where bs.booking_id = v_b.id and bs.service_id = v_s.id);
  update public.booking_services bs set "position" = 1 where bs.booking_id = v_b.id;

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

-- 6. Juan's Auto Detailing: back to plain services (owner request 2026-10-12).
--   * Headlight Restoration, Pet Hair Removal, Odor Removal: active services
--     again at $45 / $35 / $65, 30 min each (the rows section 6 of
--     services-addons-migration.sql deactivated; nothing is deleted).
--   * Their add-on copies are deactivated (kept for history).
--   * Paint Polish ($400, 300 min) and Polish + Ceramic ($600, 480 min) are
--     added only if missing. As of 2026-10-12 the live DB ALREADY has
--     "Paint Polish" and "Polish + Ceramic Coat" at exactly those prices and
--     lengths, so on production this inserts nothing and leaves them as-is.
--   Idempotent: safe to re-run.
-- SECTION6-BEGIN
update public.services s
   set active = true, price_cents = v.price_cents, duration_min = 30
  from public.tenants t,
       (values ('Headlight Restoration', 4500), ('Pet Hair Removal', 3500), ('Odor Removal', 6500)) v(name, price_cents)
 where t.id = s.tenant_id and t.slug = 'juans-auto-detailing' and s.name = v.name
   and (not s.active or s.price_cents <> v.price_cents or s.duration_min <> 30);
update public.service_addons a set active = false
  from public.tenants t
 where t.id = a.tenant_id and t.slug = 'juans-auto-detailing'
   and a.name in ('Headlight Restoration', 'Pet Hair Removal', 'Odor Removal') and a.active;
insert into public.services (tenant_id, name, price_cents, duration_min, active, sort_order)
select t.id, v.name, v.price_cents, v.duration_min, true,
       coalesce((select max(s.sort_order) from public.services s where s.tenant_id = t.id), 0) + v.n
  from public.tenants t,
       (values (1, 'Paint Polish', 40000, 300, 'Paint Polish'),
               (2, 'Polish + Ceramic', 60000, 480, 'Polish + Ceramic%')) v(n, name, price_cents, duration_min, match)
 where t.slug = 'juans-auto-detailing'
   and not exists (select 1 from public.services s where s.tenant_id = t.id and s.name ilike v.match);
-- SECTION6-END

commit;
