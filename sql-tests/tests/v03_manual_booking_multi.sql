-- TEST: staff Add Booking takes any number of services in one transaction, blocks the FULL combined length and rejects overlaps without leaving orphans
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
select * from public.create_manual_booking(p_tenant_id => '66666666-6666-6666-6666-666666666666', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 5)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => 'F-150', p_new_name => 'Phone Pat',
  p_service_ids => array['66660000-0000-0000-0000-000000000002','66660000-0000-0000-0000-000000000001']::uuid[]);
do $$ declare b record; begin
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.full_name = 'Phone Pat';
  assert b.status = 'approved' and b.duration_min = 90 and b.price_cents = 10500, format('manual multi wrong: %s %s %s', b.status, b.duration_min, b.price_cents);
  assert b.service_id = '66660000-0000-0000-0000-000000000002', 'first service must be Pet Hair';
  assert (select string_agg(name, ',' order by position) from public.booking_services where booking_id = b.id) = 'E Pet Hair,E Wash', 'snapshot wrong';
end $$;
-- 10:00 is inside 9:00-10:30: rejected, no customer/vehicle left behind
select sqltest.expect_error(format($q$select public.create_manual_booking('66666666-6666-6666-6666-666666666666', null, %s, '10:00','dropoff','Orphan E', null, 'Orphan Ed',
  null, null, null, null, array['66660000-0000-0000-0000-000000000002']::uuid[])$q$, sqltest.d(5)), '%overlap another booking%');
-- staff can't pick inactive services either
select sqltest.expect_error(format($q$select public.create_manual_booking('66666666-6666-6666-6666-666666666666', null, %s, '13:00','dropoff','Orphan E', null, 'Orphan Ed',
  null, null, null, null, array['66660000-0000-0000-0000-000000000004']::uuid[])$q$, sqltest.d(5)), '%service isn''t available%');
-- old single-service call still works
select booking_id is not null as old_call from public.create_manual_booking('66666666-6666-6666-6666-666666666666','66660000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 5)), '10:30','dropoff','Civic', null, 'Old Olive');
reset role;
do $$ begin
  assert not exists (select 1 from public.profiles where full_name = 'Orphan Ed'), 'rejected booking left a customer';
  assert not exists (select 1 from public.vehicles where label = 'Orphan E'), 'rejected booking left a vehicle';
  assert (select count(*) from public.booking_services bs join public.bookings b on b.id = bs.booking_id join public.profiles p on p.id = b.profile_id
           where p.full_name = 'Old Olive') = 1, 'old manual call must write one booking_services row';
end $$;
