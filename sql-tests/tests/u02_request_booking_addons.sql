-- TEST: request_booking takes any number of add-ons, sums price/minutes server-side, and blocks the FULL duration
select sqltest.as_anon();
-- duplicate ids are deduped: 60 + 30 + 60 = 150 min, 7000 + 3500 + 5000 = 15500
select booking_id is not null as ok from public.request_booking(p_tenant_slug => 'shop-d', p_service_id => 'dddd0000-0000-0000-0000-000000000001',
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 5)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => '2020 Honda Civic', p_guest_name => 'Addie Addon', p_guest_phone => '5553000001',
  p_addon_ids => array['add00000-0000-0000-0000-000000000001','add00000-0000-0000-0000-000000000002','add00000-0000-0000-0000-000000000001']::uuid[]);
reset role;
do $$ declare b record; begin
  select * into b from public.bookings where tenant_id = '44444444-4444-4444-4444-444444444444' and start_time = '09:00'
     and booking_date = (now() at time zone 'America/Denver')::date + 5;
  assert b.duration_min = 150, format('duration should be 150, got %s', b.duration_min);
  assert b.price_cents = 15500, format('price should be 15500, got %s', b.price_cents);
  assert (select count(*) from public.booking_addons where booking_id = b.id) = 2, 'expected 2 snapshotted add-ons';
  assert (select sum(price_cents) from public.booking_addons where booking_id = b.id) = 8500, 'snapshot prices wrong';
  assert (select string_agg(name, ',' order by name) from public.booking_addons where booking_id = b.id) = 'Headlight Restoration,Pet Hair Removal', 'snapshot names wrong';
end $$;
select sqltest.as_anon();
-- the 150-min job blocks 9:00-11:30, so 11:00 is taken and 11:30 is free
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', %s, '11:00','dropoff','Car',null,null,'Bea B','5553000002',null,null)$q$, sqltest.d(5)), '%just taken%');
select booking_id is not null as ok_1130 from public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', (select ((now() at time zone 'America/Denver')::date + 5)), '11:30','dropoff','Car',null,null,'Bea B','5553000002',null,null);
-- add-on minutes count against closing time: 15:30 + 60 is fine alone, not with +60 add-on
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', %s, '15:30','dropoff','Car',null,null,'Cy C','5553000003',null,null, array['add00000-0000-0000-0000-000000000002']::uuid[])$q$, sqltest.d(6)), '%isn''t available%');
-- inactive add-on, another tenant's add-on, unknown id: rejected
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car',null,null,'Cy C','5553000003',null,null, array['add00000-0000-0000-0000-000000000003']::uuid[])$q$, sqltest.d(6)), '%add-ons isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car',null,null,'Cy C','5553000003',null,null, array['add00000-0000-0000-0000-0000000000a1']::uuid[])$q$, sqltest.d(6)), '%add-ons isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car',null,null,'Cy C','5553000003',null,null, array[gen_random_uuid()])$q$, sqltest.d(6)), '%add-ons isn''t available%');
-- inactive services are not bookable
select sqltest.expect_error(format($q$select public.request_booking('shop-d','dddd0000-0000-0000-0000-000000000003', %s, '09:00','dropoff','Car',null,null,'Cy C','5553000003',null,null)$q$, sqltest.d(6)), '%service isn''t available%');
-- the deployed frontend's 12 named args (no p_addon_ids) still work, with no add-on rows
select booking_id is not null as old_call_ok from public.request_booking(p_tenant_slug => 'shop-d', p_service_id => 'dddd0000-0000-0000-0000-000000000001',
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 6)), p_start_time => '15:30', p_type => 'dropoff',
  p_vehicle_label => 'Car', p_vehicle_color => null, p_mobile_address => null, p_guest_name => 'Cy C', p_guest_phone => '5553000003',
  p_guest_email => null, p_guest_zip => null);
reset role;
do $$ begin
  assert (select count(*) from pg_proc where proname = 'request_booking' and pronamespace = 'public'::regnamespace) = 1, 'exactly one request_booking signature expected';
  assert (select duration_min from public.bookings where tenant_id = '44444444-4444-4444-4444-444444444444' and start_time = '15:30') = 60, 'old call duration wrong';
end $$;
