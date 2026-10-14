-- ============================================================================
-- booking-window-migration.sql: customers can book up to 180 days ahead.
-- Target: Supabase project tzopofqahgenotfxkyzf. STATUS: NOT APPLIED.
--
-- Why: request_booking() (the customer portal / guest booking RPC) rejects
-- any date later than today + 13 days ("c_max_days_ahead constant int := 13"),
-- so the portal could only offer two weeks. The frontend now offers today ..
-- today + 180 (BOOKING_WINDOW_DAYS in src/lib/time.js); without this change
-- the server would refuse those dates.
--
-- The only change is 13 -> 180. The body below is the live function exactly
-- (pg_get_functiondef md5 6c3250cd86a3e82a89b0aa8b98d4790f, checked read-only
-- on 2026-10-14, identical to host-booking-migration.sql). CREATE OR REPLACE
-- with the same signature keeps existing grants.
--
-- create_manual_booking / reschedule_booking / assert_staff_slot /
-- set_booking_services and the public_availability view have no upper date
-- limit, so staff flows need no SQL change.
-- ============================================================================
begin;

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
$function$
;

commit;
