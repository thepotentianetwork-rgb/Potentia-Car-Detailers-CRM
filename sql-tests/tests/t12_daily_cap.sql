-- TEST: at most 30 guest requests per business per 24 hours
-- Age the existing guest requests by 2h so the hourly cap no longer applies...
update public.bookings b set created_at = now() - interval '2 hours'
  from public.profiles p where p.id = b.profile_id and p.source = 'guest' and b.tenant_id = '11111111-1111-1111-1111-111111111111';
-- ...so a guest can book again,
select sqltest.as_anon();
select booking_id is not null as hourly_cap_released from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 11)), '09:00','dropoff','Car',null,null,'Day Guest','5557770001',null,null);
reset role;
-- then pad shop-a to exactly 30 guest requests in the last 24h (declined, so no slots or phone caps are involved).
insert into public.profiles (id, tenant_id, full_name, phone, role, source)
values ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pad Guest', '5557770099', 'customer', 'guest');
insert into public.bookings (profile_id, service_id, tenant_id, booking_date, start_time, duration_min, type, status, price_cents, created_at)
select 'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
       (now() at time zone 'America/Denver')::date + 12, '09:00', 60, 'dropoff', 'declined', 5000, now() - interval '3 hours'
  from generate_series(1, 30 - (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
                                 where b.tenant_id = '11111111-1111-1111-1111-111111111111' and p.source = 'guest'
                                   and b.created_at > now() - interval '24 hours')::int);
select sqltest.as_anon();
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '13:00','dropoff','Car',null,null,'Late Guest','5557770002',null,null)$q$, sqltest.d(11)), '%lot of requests%');
