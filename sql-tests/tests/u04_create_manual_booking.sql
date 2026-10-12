-- TEST: staff Add Booking is one transaction (customer + vehicle + booking + add-ons), blocks the FULL duration and rejects overlaps/past times without leaving orphans
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select * from public.create_manual_booking(p_tenant_id => '44444444-4444-4444-4444-444444444444', p_service_id => 'dddd0000-0000-0000-0000-000000000001',
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 7)), p_start_time => '10:00', p_type => 'dropoff',
  p_vehicle_label => '2019 Tacoma', p_new_name => 'Walk Dee', p_new_phone => '555-300-0010', p_staff_id => 'dddddddd-0000-0000-0000-000000000004',
  p_addon_ids => array['add00000-0000-0000-0000-000000000001','add00000-0000-0000-0000-000000000004']::uuid[]);
do $$ declare b record; begin
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.full_name = 'Walk Dee';
  assert b.status = 'approved' and b.duration_min = 90 and b.price_cents = 11500, format('manual booking wrong: %s %s %s', b.status, b.duration_min, b.price_cents);
  assert b.staff_id = 'dddddddd-0000-0000-0000-000000000004', 'staff not set';
  assert (select count(*) from public.booking_addons where booking_id = b.id) = 2, 'manual booking add-ons missing';
  assert (select source from public.profiles where id = b.profile_id) = 'staff', 'new customer must be source staff';
  assert (select label from public.vehicles where id = b.vehicle_id) = '2019 Tacoma', 'vehicle missing';
end $$;
-- 11:00 is inside Walk Dee's 10:00-11:30: rejected, and no customer/vehicle left behind
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '11:00','dropoff','Orphan Car', null, 'Overlap Olga')$q$, sqltest.d(7)), '%overlap another booking%');
do $$ begin
  assert not exists (select 1 from public.profiles where full_name = 'Overlap Olga'), 'rejected manual booking left a customer behind';
  assert not exists (select 1 from public.vehicles where label = 'Orphan Car'), 'rejected manual booking left a vehicle behind';
end $$;
-- existing customer at 11:30 (60 min) is fine
select booking_id is not null as existing_ok from public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 7)), '11:30','dropoff','Civic', 'dddddddd-0000-0000-0000-000000000005');
-- a mobile job at d8 14:00 (busy 13:45-15:15 with the 30-min travel buffer)
select booking_id is not null as mobile_ok from public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 8)), '14:00','mobile','Van', 'dddddddd-0000-0000-0000-000000000005', null, null, null, '9 Elm St');
-- past, after closing, wrong-tenant customer, inactive add-on
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '10:00','dropoff','Car', null, 'Late Larry')$q$, sqltest.d(-1)), '%already passed%');
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '16:30','dropoff','Car', null, 'Late Larry', null, null, null, array['add00000-0000-0000-0000-000000000001']::uuid[])$q$, sqltest.d(9)), '%past closing%');
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car', 'eeeeeeee-0000-0000-0000-000000000001')$q$, sqltest.d(9)), '%Select a customer%');
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car', null, 'Odie', null, null, null, array['add00000-0000-0000-0000-000000000003']::uuid[])$q$, sqltest.d(9)), '%add-ons isn''t available%');
reset role;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car', null, 'Cross Tenant')$q$, sqltest.d(9)), '%Not allowed%');
reset role;
select sqltest.as_anon();
select sqltest.expect_error(format($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car', null, 'Anon')$q$, sqltest.d(9)), '%permission denied%');
