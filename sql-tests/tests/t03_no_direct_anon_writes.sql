-- TEST: anon still cannot insert bookings/profiles directly, nor read any profile (guard)
select sqltest.as_anon();
select sqltest.expect_error($q$insert into public.bookings (profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, price_cents)
  values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', current_date + 1, '09:00', 60, 'dropoff', 0)$q$, '%row-level security%');
select sqltest.expect_error($q$insert into public.profiles (tenant_id, full_name, role) values ('11111111-1111-1111-1111-111111111111','x','customer')$q$, '%row-level security%');
do $$ begin assert (select count(*) from public.profiles) = 0, 'anon can read profiles'; end $$;
