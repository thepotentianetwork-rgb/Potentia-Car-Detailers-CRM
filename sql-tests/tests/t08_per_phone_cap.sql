-- TEST: a guest phone can have at most 2 pending future requests per business
-- (Al Guest already has 1 pending: t04's 11:30 mobile booking)
select sqltest.as_anon();
select booking_id is not null as second_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', (select ((now() at time zone 'America/Denver')::date + 6)), '09:00','dropoff','2019 Kia Soul',null,null,'Al Guest','+1 555 201 0002',null,null);
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '13:00','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010002',null,null)$q$, sqltest.d(7)), '%waiting for approval%');
