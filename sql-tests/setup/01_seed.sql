-- Fake seed data only (no real customers).
insert into public.tenants (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Shop A', 'shop-a'),
  ('22222222-2222-2222-2222-222222222222', 'Shop B', 'shop-b');
insert into public.services (id, name, price_cents, duration_min, tenant_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Basic Wash', 5000, 60, '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Shop B Wash', 7000, 60, '22222222-2222-2222-2222-222222222222');
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000001', 'cust@example.com', '{"full_name":"Test Customer","tenant_slug":"shop-a"}');
insert into public.profiles (id, full_name, role, tenant_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'Owner A', 'business_owner', '11111111-1111-1111-1111-111111111111');
-- A customer that staff entered by hand before this migration (no auth user):
-- PART 1 must label it source = 'staff'.
insert into public.profiles (id, full_name, phone, role, tenant_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Walk In', '(555) 999-0000', 'customer', '11111111-1111-1111-1111-111111111111');
-- an existing booking far enough out to be "future" in every test run
insert into public.bookings (profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        ((now() at time zone 'America/Denver')::date + 3), '10:00', 60, 'dropoff', 'approved', 5000);
-- Juan's shop (fake copy of the live rows that section 6 moves to add-ons,
-- names/prices/minutes as read 2026-10-12) plus a booking on one of them.
insert into public.tenants (id, name, slug) values ('55555555-5555-5555-5555-555555555555', 'Juan Test', 'juans-auto-detailing');
insert into public.services (id, name, price_cents, duration_min, tenant_id, sort_order) values
  ('55550000-0000-0000-0000-000000000001', 'Exterior Only', 7500, 90, '55555555-5555-5555-5555-555555555555', 6),
  ('55550000-0000-0000-0000-000000000009', 'Headlight Restoration', 4500, 30, '55555555-5555-5555-5555-555555555555', 9),
  ('55550000-0000-0000-0000-000000000010', 'Pet Hair Removal', 3500, 30, '55555555-5555-5555-5555-555555555555', 10),
  ('55550000-0000-0000-0000-000000000011', 'Odor Removal', 6500, 30, '55555555-5555-5555-5555-555555555555', 11);
insert into public.profiles (id, full_name, role, tenant_id) values
  ('55550000-1111-0000-0000-000000000001', 'Juan Cust', 'customer', '55555555-5555-5555-5555-555555555555');
insert into public.bookings (id, profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents)
values ('55550000-2222-0000-0000-000000000001', '55550000-1111-0000-0000-000000000001', '55550000-0000-0000-0000-000000000010',
        '55555555-5555-5555-5555-555555555555', ((now() at time zone 'America/Denver')::date - 3), '10:00', 30, 'dropoff', 'completed', 3500);
