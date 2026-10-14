-- TEST: customers/guests can book up to 180 days ahead (not 181); staff Add Booking and reschedule work that far out too
-- earlier tests filled the per-shop hourly request cap; age them so this test only checks the date window
update public.bookings set created_at = now() - interval '3 days';
select sqltest.as_anon();
select booking_id is not null as guest_150_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 150)), '09:00','dropoff','Far Car',null,null,'Far Guest','5554100001',null,null);
select booking_id is not null as guest_180_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 180)), '09:00','dropoff','Far Car',null,null,'Far Guest2','5554100002',null,null);
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:00','dropoff','Far Car',null,null,'Far Guest3','5554100003',null,null)$q$, sqltest.d(181)), '%next 6 months%');
reset role;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select booking_id is not null as staff_170_ok from public.create_manual_booking(p_tenant_id => '44444444-4444-4444-4444-444444444444',
  p_service_id => 'dddd0000-0000-0000-0000-000000000001', p_booking_date => (select ((now() at time zone 'America/Denver')::date + 170)),
  p_start_time => '10:00', p_type => 'dropoff', p_vehicle_label => 'Far Truck', p_new_name => 'Far Staff', p_new_phone => '555-410-0004');
select * from public.reschedule_booking((select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Far Staff'),
  (select ((now() at time zone 'America/Denver')::date + 175)), '11:00');
reset role;
do $$ begin
  assert (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name in ('Far Guest','Far Guest2')) = 2, 'guest far bookings missing';
  assert (select booking_date from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Far Staff')
         = (now() at time zone 'America/Denver')::date + 175, 'reschedule to +175 failed';
end $$;
