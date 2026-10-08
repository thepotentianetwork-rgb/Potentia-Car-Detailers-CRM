-- TEST: at most 10 guest requests per business per hour
-- Top shop-a up to exactly 10 guest requests in the last hour, then one more must be refused.
select set_config('sqltest.n', (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
   where b.tenant_id = '11111111-1111-1111-1111-111111111111' and p.source = 'guest'
     and b.created_at > now() - interval '1 hour')::text, false);
select sqltest.as_anon();
do $$
declare
  n int := current_setting('sqltest.n')::int;
  i int;
begin
  for i in 0..(9 - n) loop
    perform public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
      (now() at time zone 'America/Denver')::date + case when i < 8 then 9 else 12 end,
      make_time(9 + (i % 8), 0, 0), 'dropoff', 'Car', null, null, 'Guest ' || i, '55530000' || lpad(i::text, 2, '0'), null, null);
  end loop;
end $$;
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:00','dropoff','Car',null,null,'Late Guest','5553009999',null,null)$q$, sqltest.d(10)), '%lot of requests%');
