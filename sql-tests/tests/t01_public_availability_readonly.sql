-- TEST: anon cannot modify bookings through public_availability (PART 0), can still read it
select sqltest.as_anon();
select sqltest.expect_error($q$update public.public_availability set start_time = '06:00'$q$, '%permission denied%');
select sqltest.expect_error($q$delete from public.public_availability$q$, '%permission denied%');
select sqltest.expect_error($q$insert into public.public_availability (booking_date, start_time, duration_min, type, status, tenant_id)
  values (current_date, '09:00', 60, 'dropoff', 'approved', '11111111-1111-1111-1111-111111111111')$q$, '%permission denied%');
do $$ begin assert (select count(*) from public.public_availability) >= 1, 'anon can no longer read availability'; end $$;
