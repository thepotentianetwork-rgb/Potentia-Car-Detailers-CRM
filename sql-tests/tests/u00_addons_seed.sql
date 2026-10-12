-- TEST: (setup) shop D, its owner and an add-on catalog for the add-on/reschedule tests
-- Shop D is used only by the u* tests so earlier tests' bookings can't interfere.
insert into public.tenants (id, name, slug) values ('44444444-4444-4444-4444-444444444444', 'Shop D', 'shop-d');
insert into public.profiles (id, full_name, role, tenant_id) values
  ('dddddddd-0000-0000-0000-000000000004', 'Owner D', 'business_owner', '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-0000-0000-0000-000000000005', 'Cust D', 'customer', '44444444-4444-4444-4444-444444444444');
insert into public.services (id, name, price_cents, duration_min, tenant_id, active, sort_order) values
  ('dddd0000-0000-0000-0000-000000000001', 'D Wash', 7000, 60, '44444444-4444-4444-4444-444444444444', true, 1),
  ('dddd0000-0000-0000-0000-000000000002', 'D Full Detail', 15000, 120, '44444444-4444-4444-4444-444444444444', true, 2),
  ('dddd0000-0000-0000-0000-000000000003', 'D Retired', 1000, 30, '44444444-4444-4444-4444-444444444444', false, 3);
