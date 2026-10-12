-- TEST: after PART 5, customers can no longer insert bookings/vehicles directly; request_booking and staff inserts still work
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000005', 'p5@example.com', '{"full_name":"Part Five","tenant_slug":"shop-a","phone":"5558880005"}');
select sqltest.as_user('cccccccc-0000-0000-0000-000000000005');
-- the old direct path: approved, free, at any time
select sqltest.expect_error(format($q$insert into public.bookings (profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents)
  values ('cccccccc-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', %s, '03:00', 60, 'dropoff', 'approved', 0)$q$, sqltest.d(13)), '%row-level security%');
select sqltest.expect_error($q$insert into public.vehicles (profile_id, tenant_id, label) values ('cccccccc-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Car')$q$, '%row-level security%');
-- the new path still works for signed-in customers
select booking_id is not null as rpc_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 13)), '14:00','dropoff','2018 Mazda 3', 'Red');
reset role;
-- staff (ManualBookingForm) can still create vehicles and approved bookings directly
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
with v as (
  insert into public.vehicles (profile_id, tenant_id, label) values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Walk-in Truck') returning id
)
insert into public.bookings (profile_id, service_id, vehicle_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents)
select 'eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', v.id, '11111111-1111-1111-1111-111111111111',
       (now() at time zone 'America/Denver')::date + 13, '12:00', 60, 'dropoff', 'approved', 5000 from v;
