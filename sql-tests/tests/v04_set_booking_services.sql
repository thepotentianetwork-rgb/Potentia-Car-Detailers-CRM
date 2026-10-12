-- TEST: staff edit the services on a booking: snapshots replaced (kept services keep their booked price), totals and FULL length recomputed, collisions rejected with nothing changed, legacy add-ons kept, old editor keeps booking_services in sync
create temp table ids as select
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Phone Pat') as pat,
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Old Olive') as olive;
grant select on ids to authenticated, anon;
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
-- Olive 10:30: Wash -> Wash + Pet (10:30-12:00, free)
select * from public.set_booking_services((select olive from ids), array['66660000-0000-0000-0000-000000000001','66660000-0000-0000-0000-000000000002']::uuid[]);
do $$ begin
  assert (select duration_min || ':' || price_cents from public.bookings where id = (select olive from ids)) = '90:10500', 'Olive totals wrong';
  assert (select string_agg(name || ':' || position, ',' order by position) from public.booking_services where booking_id = (select olive from ids)) = 'E Wash:1,E Pet Hair:2', 'Olive rows wrong';
end $$;
-- Pat 9:00: -> Polish (9:00-14:00) runs into Olive: rejected, nothing changed
select sqltest.expect_error($q$select public.set_booking_services((select pat from ids), array['66660000-0000-0000-0000-000000000003']::uuid[])$q$, '%overlap another booking%');
do $$ begin
  assert (select duration_min || ':' || price_cents || ':' || service_id from public.bookings where id = (select pat from ids)) = '90:10500:66660000-0000-0000-0000-000000000002', 'rejected edit changed the booking';
  assert (select string_agg(name, ',' order by position) from public.booking_services where booking_id = (select pat from ids)) = 'E Pet Hair,E Wash', 'rejected edit changed the rows';
end $$;
select sqltest.expect_error($q$select public.set_booking_services((select pat from ids), '{}'::uuid[])$q$, '%at least one service%');
reset role;
update public.services set price_cents = 8000 where id = '66660000-0000-0000-0000-000000000001';
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
-- drop Pet: Wash keeps its booked $70 even though the list price is now $80
select * from public.set_booking_services((select pat from ids), array['66660000-0000-0000-0000-000000000001']::uuid[]);
do $$ begin
  assert (select duration_min || ':' || price_cents || ':' || service_id from public.bookings where id = (select pat from ids)) = '60:7000:66660000-0000-0000-0000-000000000001', 'Pat after dropping Pet wrong';
  assert (select count(*) from public.booking_services where booking_id = (select pat from ids)) = 1, 'Pat should have 1 row';
end $$;
reset role;
update public.services set price_cents = 7000 where id = '66660000-0000-0000-0000-000000000001';
update public.services set active = false where id = '66660000-0000-0000-0000-000000000002';
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
-- a service already on the booking stays allowed after deactivation; a new inactive one does not
select * from public.set_booking_services((select olive from ids), array['66660000-0000-0000-0000-000000000002','66660000-0000-0000-0000-000000000001']::uuid[]);
do $$ begin
  assert (select string_agg(name || ':' || position, ',' order by position) from public.booking_services where booking_id = (select olive from ids)) = 'E Pet Hair:1,E Wash:2', 'reorder wrong';
  assert (select service_id from public.bookings where id = (select olive from ids)) = '66660000-0000-0000-0000-000000000002', 'first service must follow the new order';
end $$;
select sqltest.expect_error($q$select public.set_booking_services((select pat from ids), array['66660000-0000-0000-0000-000000000001','66660000-0000-0000-0000-000000000002']::uuid[])$q$, '%service isn''t available%');
select sqltest.expect_error($q$select public.set_booking_services((select pat from ids), array['66660000-0000-0000-0000-000000000004']::uuid[])$q$, '%service isn''t available%');
reset role;
update public.services set active = true where id = '66660000-0000-0000-0000-000000000002';
-- another business's staff can't touch it
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select sqltest.expect_error($q$select public.set_booking_services((select pat from ids), array['66660000-0000-0000-0000-000000000001']::uuid[])$q$, '%Booking not found%');
reset role;
-- a booking from the add-on era keeps its add-on rows and their price/minutes
insert into public.service_addons (id, tenant_id, name, price_cents, extra_duration_min)
values ('add00000-0000-0000-0000-0000000000e1', '66666666-6666-6666-6666-666666666666', 'E Wax', 3000, 30);
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
select * from public.create_manual_booking('66666666-6666-6666-6666-666666666666','66660000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 6)), '09:00','dropoff','Legacy Car', null, 'Legacy Lou',
  null, null, null, array['add00000-0000-0000-0000-0000000000e1']::uuid[]);
select * from public.set_booking_services((select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Legacy Lou'),
  array['66660000-0000-0000-0000-000000000002']::uuid[]);
do $$ declare b record; begin
  select bk.* into b from public.bookings bk join public.profiles p on p.id = bk.profile_id where p.full_name = 'Legacy Lou';
  assert b.duration_min = 60 and b.price_cents = 6500, format('legacy totals wrong: %s %s', b.duration_min, b.price_cents);
  assert (select string_agg(name, ',') from public.booking_addons where booking_id = b.id) = 'E Wax', 'legacy add-on row must stay';
end $$;
-- the old editor (one service + add-ons) resets booking_services to that service
select * from public.set_booking_service_addons((select olive from ids), '66660000-0000-0000-0000-000000000003', null);
reset role;
do $$ begin
  assert (select string_agg(name || ':' || position, ',') from public.booking_services where booking_id = (select olive from ids)) = 'E Polish:1', 'old editor did not sync booking_services';
  assert (select duration_min from public.bookings where id = (select olive from ids)) = 300, 'old editor duration wrong';
end $$;
-- put Olive back to Wash (60) for the reschedule test
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
select * from public.set_booking_services((select olive from ids), array['66660000-0000-0000-0000-000000000001']::uuid[]);
