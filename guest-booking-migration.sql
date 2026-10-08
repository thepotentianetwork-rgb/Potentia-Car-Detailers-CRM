-- ============================================================================
-- Guest booking from the customer portal ("Continue as guest").
-- Target: Supabase project tzopofqahgenotfxkyzf, Postgres 17.
-- Prereq: guest-customers-schema.sql (already live as of 2026-10-08:
--   profiles.id no longer FKs auth.users, defaults to gen_random_uuid();
--   staff insert policies on profiles/vehicles/bookings; bookings.staff_id).
--
-- STATUS (2026-10-08):
--   PART 0     APPLIED to the live database on 2026-10-08 (owner approved).
--              Kept here so the file is complete; re-running it is harmless.
--   PARTS 1-4  NOT applied yet. Backwards compatible with the current
--              frontend, so they can be applied before the new frontend ships.
--              The new frontend NEEDS them (request_booking(), new columns).
--   PART 5     NOT applied. Commented out on purpose; see the bottom of file.
--
-- Deploy order:
--   1. Owner approves, then run this file (PARTS 0-4) in the SQL editor.
--   2. Deploy the frontend that books through request_booking().
--   3. Only then run PART 5. Running it earlier breaks booking for
--      signed-in customers on the old frontend.
--
-- Tests: sql-tests/run.sh rebuilds a local mock of the live schema in a
-- throwaway Postgres, applies this file and runs the SQL tests. Never point
-- it at the live database.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- PART 0. ALREADY APPLIED TO THE LIVE DATABASE ON 2026-10-08 (idempotent).
-- public_availability is a simple (auto-updatable) view owned
-- by postgres (BYPASSRLS) without security_invoker, and anon/authenticated
-- hold INSERT/UPDATE/DELETE on it. Through PostgREST
-- (PATCH/DELETE /rest/v1/public_availability) anyone holding the public anon
-- key can reschedule, cancel or delete any non-declined booking in ANY tenant.
-- Keep SELECT (the booking UI needs it), revoke everything else.
-- ----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.public_availability from anon, authenticated, public;


-- ----------------------------------------------------------------------------
-- PART 1. Columns
-- ----------------------------------------------------------------------------

-- Business-local "today", so the server can reject past dates/times.
alter table public.tenants
  add column if not exists timezone text not null default 'America/Denver';

-- Guest contact info lives on the guest profile row (guests have no
-- auth.users row, so staff otherwise could not see an email at all).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists zip text;
-- 'account' = self-signup, 'staff' = walk-in/phone created by staff,
-- 'guest' = booked from the portal without an account.
alter table public.profiles add column if not exists source text not null default 'account';

alter table public.profiles drop constraint if exists profiles_source_check;
alter table public.profiles add constraint profiles_source_check
  check (source in ('account', 'staff', 'guest'));
alter table public.profiles drop constraint if exists profiles_zip_format;
alter table public.profiles add constraint profiles_zip_format
  check (zip is null or zip ~ '^[0-9]{5}$');
alter table public.profiles drop constraint if exists profiles_email_len;
alter table public.profiles add constraint profiles_email_len
  check (email is null or length(email) <= 254);

-- Customer profiles with no auth user were created by staff (ManualBookingForm).
-- Safe to re-run: if staff add customers between applying this and deploying
-- the frontend that sends source='staff', run this UPDATE again afterwards.
update public.profiles p
   set source = 'staff'
 where p.role = 'customer'
   and p.source = 'account'
   and not exists (select 1 from auth.users u where u.id = p.id);

alter table public.vehicles add column if not exists color text;
alter table public.vehicles drop constraint if exists vehicles_color_len;
alter table public.vehicles add constraint vehicles_color_len
  check (color is null or length(color) <= 30);

create index if not exists bookings_tenant_date_idx on public.bookings (tenant_id, booking_date);
create index if not exists profiles_guest_phone_idx on public.profiles (tenant_id, phone) where source = 'guest';


-- ----------------------------------------------------------------------------
-- PART 2. Signup trigger also stores phone / ZIP / email from signup metadata
-- (customers have no UPDATE policy on profiles, so this is the only place a
-- self-signup can set them). Junk values are dropped, never rejected, so a
-- bad phone can't block account creation.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  resolved_tenant_id uuid;
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g');
  v_zip   text := btrim(coalesce(new.raw_user_meta_data->>'zip', ''));
begin
  select id into resolved_tenant_id
  from public.tenants
  where slug = new.raw_user_meta_data->>'tenant_slug';

  if length(v_phone) = 11 and left(v_phone, 1) = '1' then v_phone := substr(v_phone, 2); end if;
  if length(v_phone) <> 10 then v_phone := null; end if;
  if v_zip !~ '^[0-9]{5}$' then v_zip := null; end if;

  insert into public.profiles (id, full_name, role, tenant_id, phone, zip, email, source)
  values (new.id, left(new.raw_user_meta_data->>'full_name', 100), 'customer', resolved_tenant_id,
          v_phone, v_zip, left(new.email, 254), 'account');

  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- PART 3. Helper: "9:00 AM" -> minutes since midnight (mirrors parse12h()).
-- ----------------------------------------------------------------------------
create or replace function public.hm12_to_minutes(p text)
returns int
language plpgsql immutable
set search_path = ''
as $$
declare
  m text[] := regexp_match(btrim(p), '^([0-9]{1,2}):([0-9]{2})\s*([AaPp][Mm])$');
  h int;
begin
  if m is null then raise exception 'bad time: %', p; end if;
  h := m[1]::int;
  if upper(m[3]) = 'PM' and h <> 12 then h := h + 12; end if;
  if upper(m[3]) = 'AM' and h = 12 then h := 0; end if;
  return h * 60 + m[2]::int;
end;
$$;


-- ----------------------------------------------------------------------------
-- PART 4. request_booking(): the ONLY way the portal creates bookings.
--   * anon caller            -> guest path: validates contact info, creates a
--                               source='guest' profile + vehicle + booking.
--   * signed-in customer     -> uses their own profile (must belong to tenant).
--   * signed-in staff/admin  -> rejected (staff use ManualBookingForm).
-- Server decides price, duration and status ('pending'). It re-checks
-- business hours, slot granularity, date window, past times (business tz)
-- and overlap with the exact semantics of getAvailableStarts(), under an
-- advisory lock so two people can't grab the same slot concurrently.
-- Guest abuse caps: max 2 pending future requests per phone per tenant,
-- max 10 guest requests per tenant per hour and 30 per 24h.
-- ----------------------------------------------------------------------------
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
  p_guest_zip      text default null
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
  v_end   := v_start + v_service.duration_min;
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
          v_service.duration_min, p_type, v_addr, 'pending', v_service.price_cents)
  returning id into v_booking_id;

  return query select v_booking_id, p_booking_date, p_start_time, 'pending'::text;
end;
$$;

revoke all on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text) from public;
grant execute on function public.request_booking(text, uuid, date, time, text, text, text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.hm12_to_minutes(text) from public, anon, authenticated;

commit;


-- ----------------------------------------------------------------------------
-- PART 5. RUN ONLY AFTER the frontend that books via request_booking() is live
-- (and the owner approves). To apply: uncomment the two lines below and run
-- them on their own. sql-tests/run.sh applies them to the local mock to prove
-- the new frontend's booking path still works without them.
-- Closes the direct-insert path, which today lets a signed-in customer insert
-- a booking with status 'approved', price_cents 0, any time, overlapping slots.
-- ----------------------------------------------------------------------------
-- drop policy if exists "customers create own bookings" on public.bookings;
-- drop policy if exists "customers create own vehicles" on public.vehicles;
