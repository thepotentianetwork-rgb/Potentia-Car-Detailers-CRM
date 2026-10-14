-- TEST: a signed-in Potentia admin, shop owner/staff or another shop's customer books through the public form as a GUEST (guest checks and caps apply); the shop's own customer still books on their account
insert into public.profiles (id, full_name, role, tenant_id) values
  ('aaaa0000-ad00-0000-0000-000000000001', 'Host Admin', 'potentia_admin', null),
  ('aaaa0000-ad00-0000-0000-000000000002', 'E Staff', 'staff', '66666666-6666-6666-6666-666666666666');
-- Potentia admin, two services
select sqltest.as_user('aaaa0000-ad00-0000-0000-000000000001');
select booking_id is not null as admin_ok from public.request_booking(p_tenant_slug => 'shop-e', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 9)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => 'Host Car', p_guest_name => 'Nando Test', p_guest_phone => '5559000001',
  p_service_ids => array['66660000-0000-0000-0000-000000000002','66660000-0000-0000-0000-000000000001']::uuid[]);
-- still needs the guest fields like any guest
select sqltest.expect_error(format($q$select public.request_booking('shop-e','66660000-0000-0000-0000-000000000002', %s, '13:00','dropoff','Host Car')$q$, sqltest.d(9)), '%Enter your name%');
select sqltest.expect_error(format($q$select public.request_booking('shop-e','66660000-0000-0000-0000-000000000002', %s, '13:00','dropoff','Host Car',null,null,'Nando Test','555-12',null,null)$q$, sqltest.d(9)), '%10-digit phone%');
-- this shop's staff, and the owner of another shop
select sqltest.as_user('aaaa0000-ad00-0000-0000-000000000002');
select booking_id is not null as staff_ok from public.request_booking('shop-e','66660000-0000-0000-0000-000000000002',
  (select ((now() at time zone 'America/Denver')::date + 9)), '13:00','dropoff','Staff Car',null,null,'Staff Try','5559000002',null,null);
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select booking_id is not null as other_owner_ok from public.request_booking('shop-e','66660000-0000-0000-0000-000000000002',
  (select ((now() at time zone 'America/Denver')::date + 9)), '14:00','dropoff','Other Car',null,null,'Owner D Try','5559000003',null,null);
reset role;
do $$ declare b record; begin
  select bk.*, p.source, p.role, p.full_name, p.id as pid into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.phone = '5559000001';
  assert b.source = 'guest' and b.role = 'customer' and b.full_name = 'Nando Test', 'admin booking must create a guest profile';
  assert b.pid <> 'aaaa0000-ad00-0000-0000-000000000001', 'admin booking must not be filed under the admin';
  assert b.status = 'pending' and b.duration_min = 90 and b.price_cents = 10500, format('admin booking wrong: %s %s %s', b.status, b.duration_min, b.price_cents);
  assert (select string_agg(name, ',' order by position) from public.booking_services where booking_id = b.id) = 'E Pet Hair,E Wash', 'services snapshot wrong';
  assert (select role from public.profiles where id = 'aaaa0000-ad00-0000-0000-000000000001') = 'potentia_admin', 'admin profile must not change';
  assert (select count(*) from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.phone in ('5559000002','5559000003') and p.source = 'guest') = 2, 'staff/other-owner bookings must be guest bookings';
  assert not exists (select 1 from public.bookings where profile_id in ('aaaa0000-ad00-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000004')), 'nothing filed under staff/owner';
end $$;
-- the guest per-phone cap applies to hosts too (2 pending per phone)
select sqltest.as_user('aaaa0000-ad00-0000-0000-000000000001');
select booking_id is not null from public.request_booking('shop-e','66660000-0000-0000-0000-000000000002',
  (select ((now() at time zone 'America/Denver')::date + 10)), '09:00','dropoff','Host Car',null,null,'Nando Test','5559000001',null,null);
select sqltest.expect_error(format($q$select public.request_booking('shop-e','66660000-0000-0000-0000-000000000002', %s, '11:00','dropoff','Host Car',null,null,'Nando Test','5559000001',null,null)$q$, sqltest.d(10)), '%already have requests waiting%');
reset role;
-- the shop's own customer still books on their account (no guest fields needed)
select sqltest.as_user('66660000-1111-0000-0000-000000000002');
select booking_id is not null as own_customer_ok from public.request_booking('shop-e','66660000-0000-0000-0000-000000000002',
  (select ((now() at time zone 'America/Denver')::date + 10)), '13:00','dropoff','Truck');
reset role;
do $$ begin
  assert (select count(*) from public.bookings where profile_id = '66660000-1111-0000-0000-000000000002'
           and booking_date = (now() at time zone 'America/Denver')::date + 10) = 1, 'own customer booking must be on their account';
end $$;
