-- Loaded after services-addons-migration.sql, before multiservice-migration.sql:
-- a completed Juan's booking from the add-on era (Exterior Only + Pet Hair
-- Removal add-on), as it would exist in production. The v* tests check the
-- multiservice migration leaves it exactly as it was.
insert into public.bookings (id, profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents)
values ('55550000-2222-0000-0000-000000000002', '55550000-1111-0000-0000-000000000001', '55550000-0000-0000-0000-000000000001',
        '55555555-5555-5555-5555-555555555555', ((now() at time zone 'America/Denver')::date - 2), '10:00', 120, 'dropoff', 'completed', 11000);
insert into public.booking_addons (booking_id, tenant_id, addon_id, name, price_cents, extra_duration_min)
select '55550000-2222-0000-0000-000000000002', a.tenant_id, a.id, a.name, a.price_cents, a.extra_duration_min
  from public.service_addons a where a.tenant_id = '55555555-5555-5555-5555-555555555555' and a.name = 'Pet Hair Removal';
