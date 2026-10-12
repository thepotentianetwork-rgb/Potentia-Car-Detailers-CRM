-- TEST: (setup) shop E, its owner, a customer and four services for the multi-service tests
insert into public.tenants (id, name, slug) values ('66666666-6666-6666-6666-666666666666', 'Shop E', 'shop-e');
insert into public.profiles (id, full_name, role, tenant_id) values
  ('66660000-1111-0000-0000-000000000001', 'Owner E', 'business_owner', '66666666-6666-6666-6666-666666666666'),
  ('66660000-1111-0000-0000-000000000002', 'Cust E', 'customer', '66666666-6666-6666-6666-666666666666');
insert into public.services (id, name, price_cents, duration_min, tenant_id, active, sort_order) values
  ('66660000-0000-0000-0000-000000000001', 'E Wash', 7000, 60, '66666666-6666-6666-6666-666666666666', true, 1),
  ('66660000-0000-0000-0000-000000000002', 'E Pet Hair', 3500, 30, '66666666-6666-6666-6666-666666666666', true, 2),
  ('66660000-0000-0000-0000-000000000003', 'E Polish', 40000, 300, '66666666-6666-6666-6666-666666666666', true, 3),
  ('66660000-0000-0000-0000-000000000004', 'E Retired', 1000, 30, '66666666-6666-6666-6666-666666666666', false, 4);
