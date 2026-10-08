-- TEST: a signed-in customer can have at most 5 pending future requests
-- (Test Customer has 1 pending from t09; add pending ones up to 5, the 6th is refused)
select set_config('sqltest.n', (select count(*) from public.bookings where profile_id = 'cccccccc-0000-0000-0000-000000000001'
  and status = 'pending' and booking_date >= (now() at time zone 'America/Denver')::date)::text, false);
select sqltest.as_user('cccccccc-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..(5 - current_setting('sqltest.n')::int) loop
    perform public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', (now() at time zone 'America/Denver')::date + 9 + i, '16:00', 'dropoff', 'Car');
  end loop;
end $$;
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car')$q$, sqltest.d(13)), '%several requests waiting%');
