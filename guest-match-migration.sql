-- ============================================================================
-- guest-match-migration.sql: guest-only booking with "remembered" customers
-- for shops that opt in (Juan's Auto Detailing). STATUS: NOT APPLIED.
-- Target: Supabase project tzopofqahgenotfxkyzf.
--
-- Why: Juan's portal drops customer logins (frontend flag guestOnly in
-- src/tenants/juans-auto-detailing.js). Without matching, every repeat
-- customer would become a new guest profile. request_booking() now attaches
-- a guest booking to this shop's existing customer with the same phone (or,
-- failing that, email, then a unique name) when tenants.guest_match_existing
-- is true.
--
-- Also (ALL shops, correctness fix): mobile bookings must have a full
-- service address (street, city, ZIP). request_booking and
-- create_manual_booking both reject a mobile booking without one; it's
-- stored in the existing bookings.mobile_address column (no new column).
--
-- Based on the live request_booking (booking-window version, applied
-- 2026-10-14). Changes: matching + pending cap per matched customer, flood
-- caps count matched pending requests, blank-only fill for guest profiles,
-- vehicle reuse, and a matched customer's extra vehicle is not primary.
-- Shops with guest_match_existing = false (default) behave exactly as before
-- (their new guests always get a fresh profile and primary vehicle).
-- Signed-in customers of the shop still book on their account (unchanged).
-- Same signature, SECURITY DEFINER and search_path = '': grants are kept.
-- ============================================================================
begin;

-- 1. Per-shop setting (default off), on for Juan's Auto Detailing.
alter table public.tenants add column if not exists guest_match_existing boolean not null default false;
update public.tenants set guest_match_existing = true where slug = 'juans-auto-detailing';

-- 2. Phone normaliser used for matching (same rule as normalizePhone() in
--    src/lib/contact.js: digits only, a leading US 1 dropped, else null).
create or replace function public.normalize_us_phone(p text) returns text
  language sql immutable set search_path = '' as $$
  select case when length(d) = 10 then d when length(d) = 11 and left(d, 1) = '1' then substr(d, 2) end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;
revoke all on function public.normalize_us_phone(text) from public, anon, authenticated;

-- 2b. Name normaliser for matching: trim, collapse whitespace, lower case.
create or replace function public.normalize_person_name(p text) returns text
  language sql immutable set search_path = '' as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;
revoke all on function public.normalize_person_name(text) from public, anon, authenticated;

-- 2c. Mobile service address (ALL shops): street, city and ZIP at minimum,
--     i.e. "<street>, <city>[, <state>] <ZIP>". The forms build exactly
--     "street, city ZIP" from three required fields.
create or replace function public.is_service_address(p text) returns boolean
  language sql immutable set search_path = '' as $$
  select coalesce(length(btrim(p)) between 10 and 300
    and btrim(p) ~ '^[^,]*[0-9A-Za-z][^,]*,[ ]*[^,]*[A-Za-z][^,]*(,[^,]*)*[ ,][0-9]{5}(-[0-9]{4})?$', false)
$$;
revoke all on function public.is_service_address(text) from public, anon, authenticated;

-- 3. request_booking with matching.
CREATE OR REPLACE FUNCTION public.request_booking(p_tenant_slug text, p_service_id uuid, p_booking_date date, p_start_time time without time zone, p_type text, p_vehicle_label text, p_vehicle_color text DEFAULT NULL::text, p_mobile_address text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_guest_email text DEFAULT NULL::text, p_guest_zip text DEFAULT NULL::text, p_addon_ids uuid[] DEFAULT NULL::uuid[], p_service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(booking_id uuid, booking_date date, start_time time without time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_min_lead_min   constant int := 30;   -- keep in sync with MIN_LEAD_MIN in src/lib/time.js
  c_max_days_ahead constant int := 180;
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
  v_match      boolean := false;  -- tenants.guest_match_existing
  v_matched    public.profiles%rowtype;
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
    if not public.is_service_address(v_addr) then
      raise exception 'Enter the full service address: street, city and ZIP.' using errcode = 'P0001';
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
  -- A signed-in customer of THIS business books on their account. Anyone else
  -- who is signed in (Potentia admin, this shop's owner/staff, or a customer of
  -- another shop) can still book as a guest when they send guest contact fields,
  -- so hosts can try the public booking form without signing out.
  if not v_is_guest then
    select * into v_caller from public.profiles p where p.id = v_uid;
    if found and v_caller.role = 'customer' and v_caller.tenant_id is not distinct from v_tenant.id then
      v_profile_id := v_uid;
    else
      v_is_guest := true;
    end if;
  end if;
  if v_is_guest then
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
    -- mobile: the service address carries the ZIP (checked above)
    if p_type = 'mobile' and v_zip is null then
      v_zip := substring(v_addr from '([0-9]{5})(?:-[0-9]{4})?\s*$');
    end if;
  end if;

  -- date / time rules, in the business's own timezone -------------------------------
  v_now     := now() at time zone v_tenant.timezone;
  v_today   := v_now::date;
  v_now_min := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  if p_booking_date is null or p_start_time is null
     or p_booking_date < v_today or p_booking_date > v_today + c_max_days_ahead then
    raise exception 'Pick a date in the next 6 months.' using errcode = 'P0001';
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
    v_match := coalesce(v_tenant.guest_match_existing, false);

    -- Shops with guest_match_existing (Juan's) have no customer logins on the
    -- portal; returning customers are recognised by phone, email or name instead of
    -- getting a duplicate guest profile. Rule (deterministic):
    --   1. PHONE first: a customer profile of THIS shop whose stored phone,
    --      digits only (leading US 1 dropped), equals the entered phone.
    --   2. Otherwise EMAIL: lower(trim(stored email)) = entered email.
    --   3. Otherwise NAME (see below: unique name, no conflicting contact).
    --   Phone wins over email when they point at different profiles (phone
    --   is required and is how the shop reaches people). Ties: profiles with
    --   a login (source 'account') first, then the oldest, then by id.
    -- Only role 'customer' profiles of this tenant are candidates. Nothing
    -- about the match is returned: same result and errors either way.
    if v_match then
      select p.* into v_matched from public.profiles p
       where p.tenant_id = v_tenant.id and p.role = 'customer'
         and public.normalize_us_phone(p.phone) = v_phone
       order by (p.source = 'account') desc, p.created_at, p.id limit 1;
      if not found and v_email is not null then
        select p.* into v_matched from public.profiles p
         where p.tenant_id = v_tenant.id and p.role = 'customer'
           and nullif(lower(btrim(coalesce(p.email, ''))), '') = v_email
         order by (p.source = 'account') desc, p.created_at, p.id limit 1;
      end if;
      -- 3. NAME, only when exactly one of this shop's customers has that
      --    name (trim, collapse spaces, case-insensitive) AND its stored
      --    contact doesn't conflict: stored phone blank or equal, stored
      --    email blank or equal. Several with the name, or a conflict ->
      --    no match (a new guest profile).
      if v_matched.id is null then
        select p.* into v_matched from public.profiles p
         where p.tenant_id = v_tenant.id and p.role = 'customer'
           and public.normalize_person_name(p.full_name) = public.normalize_person_name(v_name)
           and (nullif(btrim(coalesce(p.phone, '')), '') is null or public.normalize_us_phone(p.phone) = v_phone)
           and (nullif(btrim(coalesce(p.email, '')), '') is null or lower(btrim(p.email)) = v_email)
           and (select count(*) from public.profiles q
                 where q.tenant_id = v_tenant.id and q.role = 'customer'
                   and public.normalize_person_name(q.full_name) = public.normalize_person_name(v_name)) = 1;
      end if;
    end if;

    if (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and b.status = 'pending' and b.booking_date >= v_today
           and ((p.source = 'guest' and p.phone = v_phone) or b.profile_id = v_matched.id)) >= 2 then
      raise exception 'You already have requests waiting for approval. We''ll be in touch soon.' using errcode = 'P0001';
    end if;
    -- Shop-wide flood caps. With matching on, requests filed under existing
    -- (non-guest) customers count too: they are the pending ones (staff
    -- bookings are created approved).
    if (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and (p.source = 'guest' or (v_match and b.status = 'pending'))
           and b.created_at > now() - interval '1 hour') >= 10
       or (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
         where b.tenant_id = v_tenant.id and (p.source = 'guest' or (v_match and b.status = 'pending'))
           and b.created_at > now() - interval '24 hours') >= 30 then
      raise exception 'We''re getting a lot of requests right now. Please call or text us to book.' using errcode = 'P0001';
    end if;

    if v_matched.id is not null then
      v_profile_id := v_matched.id;
      -- Never overwrite what the shop has on file. Guest-created profiles
      -- only get BLANK fields filled; profiles with a login or added by
      -- staff are left exactly as they are. The name is never changed.
      if v_matched.source = 'guest' then
        update public.profiles p
           set phone = coalesce(nullif(btrim(p.phone), ''), v_phone),
               email = coalesce(nullif(btrim(p.email), ''), v_email),
               zip   = coalesce(nullif(btrim(p.zip), ''), v_zip)
         where p.id = v_profile_id;
      end if;
    else
      insert into public.profiles (tenant_id, full_name, phone, email, zip, role, source)
      values (v_tenant.id, v_name, v_phone, v_email, v_zip, 'customer', 'guest')
      returning id into v_profile_id;
    end if;
  else
    if (select count(*) from public.bookings b
         where b.profile_id = v_profile_id and b.status = 'pending' and b.booking_date >= v_today) >= 5 then
      raise exception 'You already have several requests waiting for approval.' using errcode = 'P0001';
    end if;
  end if;

  -- write ------------------------------------------------------------------------------
  -- A matched returning customer reuses their vehicle with the same label
  -- (case-insensitive) instead of piling up copies; color is only filled if blank.
  if v_matched.id is not null then
    select v.id into v_vehicle_id from public.vehicles v
     where v.profile_id = v_profile_id and v.tenant_id = v_tenant.id and lower(btrim(v.label)) = lower(v_label)
     order by v.created_at limit 1;
    if v_vehicle_id is not null and v_color is not null then
      update public.vehicles v set color = v_color where v.id = v_vehicle_id and nullif(btrim(coalesce(v.color, '')), '') is null;
    end if;
  end if;
  if v_vehicle_id is null then
    insert into public.vehicles (profile_id, tenant_id, label, color, is_primary)
    values (v_profile_id, v_tenant.id, v_label, v_color,
            v_matched.id is null or not exists (select 1 from public.vehicles v where v.profile_id = v_profile_id))
    returning id into v_vehicle_id;
  end if;

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
$function$
;


-- 4. create_manual_booking (staff Add Booking): same address rule for mobile.
--    Live body (md5 9a1a3b0adea71b3fcf1df62b70de1a12, read 2026-10-15) with
--    only the address check changed.
CREATE OR REPLACE FUNCTION public.create_manual_booking(p_tenant_id uuid, p_service_id uuid, p_booking_date date, p_start_time time without time zone, p_type text, p_vehicle_label text, p_profile_id uuid DEFAULT NULL::uuid, p_new_name text DEFAULT NULL::text, p_new_phone text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_mobile_address text DEFAULT NULL::text, p_addon_ids uuid[] DEFAULT NULL::uuid[], p_service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(booking_id uuid, price_cents integer, duration_min integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if not public.is_service_address(v_addr) then raise exception 'Enter the full service address: street, city and ZIP.' using errcode = 'P0001'; end if;
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
$function$
;

commit;

-- ----------------------------------------------------------------------------
-- SELECT-only report (run before applying): how many of Juan's customer
-- profiles already share a phone or email. Prints counts only.
-- ----------------------------------------------------------------------------
-- with t as (select id from public.tenants where slug = 'juans-auto-detailing'),
--      p as (select pr.id, pr.source,
--                   nullif(right(regexp_replace(coalesce(pr.phone,''),'[^0-9]','','g'),10),'') ph,
--                   nullif(lower(btrim(coalesce(pr.email,''))),'') em
--              from public.profiles pr, t where pr.tenant_id = t.id and pr.role = 'customer')
-- select (select count(*) from p) customers,
--        (select count(*) from (select ph from p where ph is not null group by ph having count(*) > 1) x) phone_dup_groups,
--        (select count(*) from (select em from p where em is not null group by em having count(*) > 1) x) email_dup_groups,
--        (select count(*) from p a join p b on a.id < b.id and a.ph = b.ph and a.em <> b.em) same_phone_diff_email;

-- Read-only: same-name customers in Juan's shop (name matching skips these).
-- select lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')) as name, count(*)
--   from public.profiles p join public.tenants t on t.id = p.tenant_id
--  where t.slug = 'juans-auto-detailing' and p.role = 'customer'
--  group by 1 having count(*) > 1;
