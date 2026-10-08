-- TEST: past dates, dates past +13 days, out-of-hours, off-grid and already-passed times are rejected
select sqltest.as_anon();
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:00','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(-1)), '%next two weeks%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:00','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(14)), '%next two weeks%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '16:30','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(4)), '%isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '08:30','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(4)), '%isn''t available%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:10','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(4)), '%isn''t available%');
reset role;
-- "today, already passed": open ~24h with 1-minute slots so only the lead-time rule can reject it
update public.tenants set business_hours = '{"start":"12:00 AM","end":"11:59 PM"}', booking_granularity_min = 1 where slug = 'shop-b';
select sqltest.as_anon();
do $$
declare
  now_d timestamp := now() at time zone 'America/Denver';
  t_now  text := to_char(now_d, 'HH24:MI');
  t_soon text := to_char(now_d + interval '10 minutes', 'HH24:MI');
begin
  if to_char(now_d, 'HH24:MI') < '22:30' then
    perform sqltest.expect_error(format($q$select public.request_booking('shop-b','bbbbbbbb-0000-0000-0000-000000000001', %s, %L,'dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(0), t_now), '%already passed%');
    -- inside the 30-minute lead time also counts as passed
    perform sqltest.expect_error(format($q$select public.request_booking('shop-b','bbbbbbbb-0000-0000-0000-000000000001', %s, %L,'dropoff','2019 Kia Soul',null,null,'Al Guest','5552010003',null,null)$q$, sqltest.d(0), t_soon), '%already passed%');
  else
    raise notice 'skipping already-passed checks this late in the day';
  end if;
end $$;
