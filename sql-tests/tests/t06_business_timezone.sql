-- TEST: "today" and "already passed" use the business's own timezone (tenants.timezone)
-- shop-b is open ~24h with 1-minute slots (t05). Put it in Honolulu, which is
-- 3-4h behind Denver and 10h behind UTC, so a time that is still ahead in
-- Honolulu has already passed in Denver/UTC.
update public.tenants set timezone = 'Pacific/Honolulu' where slug = 'shop-b';
select sqltest.as_anon();
do $$
declare
  hnl  timestamp := now() at time zone 'Pacific/Honolulu';
  day  date := hnl::date;
  ok_t time := date_trunc('minute', hnl + interval '60 minutes')::time;
begin
  if hnl::time < '22:30' then
    perform public.request_booking('shop-b','bbbbbbbb-0000-0000-0000-000000000001', day, ok_t, 'dropoff','Car',null,null,'Hana Guest','5556660001',null,null);
    perform sqltest.expect_error(format($q$select public.request_booking('shop-b','bbbbbbbb-0000-0000-0000-000000000001', %L, %L,'dropoff','Car',null,null,'Hana Guest','5556660002',null,null)$q$,
      day, date_trunc('minute', hnl + interval '5 minutes')::time), '%already passed%');
  else
    raise notice 'skipping timezone check this late in the Honolulu day';
  end if;
end $$;
reset role;
update public.tenants set timezone = 'America/Denver' where slug = 'shop-b';
