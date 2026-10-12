-- TEST: request_booking takes any number of services (guest and signed-in): deduped, prices and minutes summed, one block for the FULL length, snapshots in booking_services, first service in bookings.service_id
select sqltest.as_anon();
-- Wash + Pet Hair + Wash again (deduped): 90 min, $105
select booking_id is not null as ok from public.request_booking(p_tenant_slug => 'shop-e', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 2)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => '2020 Honda Civic', p_guest_name => 'Mia Multi', p_guest_phone => '5557000001',
  p_service_ids => array['66660000-0000-0000-0000-000000000001','66660000-0000-0000-0000-000000000002','66660000-0000-0000-0000-000000000001']::uuid[]);
reset role;
do $$ declare b record; begin
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.phone = '5557000001';
  assert b.duration_min = 90, format('duration should be 90, got %s', b.duration_min);
  assert b.price_cents = 10500, format('price should be 10500, got %s', b.price_cents);
  assert b.service_id = '66660000-0000-0000-0000-000000000001', 'bookings.service_id must be the first service';
  assert (select string_agg(name || ':' || price_cents || ':' || duration_min || ':' || position, ',' order by position)
            from public.booking_services where booking_id = b.id)
         = 'E Wash:7000:60:1,E Pet Hair:3500:30:2', 'booking_services snapshot wrong';
  assert not exists (select 1 from public.booking_addons where booking_id = b.id), 'no add-on rows expected';
end $$;
select sqltest.as_anon();
-- the 90-min job blocks 9:00-10:30: 10:00 taken, 10:30 free
select sqltest.expect_error(format($q$select public.request_booking('shop-e','66660000-0000-0000-0000-000000000002', %s, '10:00','dropoff','Car',null,null,'Ned N','5557000002',null,null)$q$, sqltest.d(2)), '%just taken%');
-- only Pet Hair Removal, via p_service_ids alone
select booking_id is not null as only_pet from public.request_booking(p_tenant_slug => 'shop-e', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 2)), p_start_time => '10:30', p_type => 'dropoff',
  p_vehicle_label => 'Car', p_guest_name => 'Ned N', p_guest_phone => '5557000002',
  p_service_ids => array['66660000-0000-0000-0000-000000000002']::uuid[]);
-- summed minutes count against closing: Polish (300) + Wash (60) from 12:00 ends 18:00 > 17:00
select sqltest.expect_error(format($q$select public.request_booking('shop-e',null, %s, '12:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,
  array['66660000-0000-0000-0000-000000000003','66660000-0000-0000-0000-000000000001']::uuid[])$q$, sqltest.d(3)), '%isn''t available%');
-- empty list, inactive, other tenant's, unknown, too many: rejected
select sqltest.expect_error(format($q$select public.request_booking('shop-e',null, %s, '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,'{}'::uuid[])$q$, sqltest.d(3)), '%at least one service%');
select sqltest.expect_error(format($q$select public.request_booking('shop-e','66660000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,
  array['66660000-0000-0000-0000-000000000001','66660000-0000-0000-0000-000000000004']::uuid[])$q$, sqltest.d(3)), '%service isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-e',null, %s, '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,
  array['66660000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001']::uuid[])$q$, sqltest.d(3)), '%service isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-e',null, %s, '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,
  array[gen_random_uuid()])$q$, sqltest.d(3)), '%service isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-e',null, %s, '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null,null,
  (select array_agg(gen_random_uuid()) from generate_series(1, 11)))$q$, sqltest.d(3)), '%at most 10%');
-- the deployed frontend's single-service call still works and gets one booking_services row
select booking_id is not null as old_call from public.request_booking('shop-e','66660000-0000-0000-0000-000000000003',
  (select ((now() at time zone 'America/Denver')::date + 3)), '09:00','dropoff','Car',null,null,'Oz O','5557000003',null,null);
reset role;
do $$ declare b record; begin
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.phone = '5557000002';
  assert b.service_id = '66660000-0000-0000-0000-000000000002' and b.duration_min = 30 and b.price_cents = 3500, 'Pet-only booking wrong';
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.phone = '5557000003';
  assert b.duration_min = 300 and b.price_cents = 40000, 'old single-service call wrong';
  assert (select count(*) from public.booking_services where booking_id = b.id and service_id = '66660000-0000-0000-0000-000000000003') = 1, 'old call must write one booking_services row';
end $$;
-- signed-in customer, two services
select sqltest.as_user('66660000-1111-0000-0000-000000000002');
select booking_id is not null as signed_in from public.request_booking(p_tenant_slug => 'shop-e', p_service_id => '66660000-0000-0000-0000-000000000002',
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 4)), p_start_time => '13:00', p_type => 'dropoff',
  p_vehicle_label => 'Truck', p_service_ids => array['66660000-0000-0000-0000-000000000002','66660000-0000-0000-0000-000000000001']::uuid[]);
-- the customer can read their own booking_services rows, not other people's
do $$ begin
  assert (select count(*) from public.booking_services bs join public.bookings b on b.id = bs.booking_id
           where b.profile_id = '66660000-1111-0000-0000-000000000002') = 2, 'customer should see own 2 rows';
  assert (select count(*) from public.booking_services) = 2, 'customer must not see other bookings'' rows';
end $$;
reset role;
do $$ declare b record; begin
  select * into b from public.bookings where profile_id = '66660000-1111-0000-0000-000000000002';
  assert b.duration_min = 90 and b.price_cents = 10500 and b.service_id = '66660000-0000-0000-0000-000000000002', 'signed-in multi booking wrong';
end $$;
