-- TEST: staff change service/add-ons on a booking: price and FULL duration recomputed, longer jobs that would collide or run past closing are rejected
-- d5: Addie 09:00 (150 min, 2 add-ons), Bea 11:30 (60). d6: Cy 15:30 (60).
create temp table ids as select
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5553000001' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as addie,
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5553000002' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as bea,
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5553000003' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as cy;
grant select on ids to authenticated, anon;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
-- Bea: + Headlight (60) -> 11:30-13:30, free
select * from public.set_booking_service_addons((select bea from ids), 'dddd0000-0000-0000-0000-000000000001', array['add00000-0000-0000-0000-000000000002']::uuid[]);
do $$ begin
  assert (select duration_min from public.bookings where id = (select bea from ids)) = 120, 'Bea duration should be 120';
  assert (select price_cents from public.bookings where id = (select bea from ids)) = 12000, 'Bea price should be 12000';
end $$;
-- Addie: Full Detail 120 + 30 + 60 = 210 -> 09:00-12:30 runs into Bea at 11:30: rejected, nothing changed
select sqltest.expect_error($q$select public.set_booking_service_addons((select addie from ids), 'dddd0000-0000-0000-0000-000000000002', array['add00000-0000-0000-0000-000000000001','add00000-0000-0000-0000-000000000002']::uuid[])$q$, '%overlap another booking%');
do $$ begin
  assert (select duration_min from public.bookings where id = (select addie from ids)) = 150, 'rejected change must not alter duration';
  assert (select count(*) from public.booking_addons where booking_id = (select addie from ids)) = 2, 'rejected change must not alter add-ons';
end $$;
-- Addie: drop Headlight -> 60 + 30 = 90, price 10500
select * from public.set_booking_service_addons((select addie from ids), 'dddd0000-0000-0000-0000-000000000001', array['add00000-0000-0000-0000-000000000001']::uuid[]);
do $$ begin
  assert (select duration_min from public.bookings where id = (select addie from ids)) = 90, 'Addie duration should be 90';
  assert (select price_cents from public.bookings where id = (select addie from ids)) = 10500, 'Addie price should be 10500';
  assert (select count(*) from public.booking_addons where booking_id = (select addie from ids)) = 1, 'Addie should have 1 add-on';
end $$;
-- Cy 15:30 + 60 add-on would end 17:30, after the 5 PM close
select sqltest.expect_error($q$select public.set_booking_service_addons((select cy from ids), 'dddd0000-0000-0000-0000-000000000001', array['add00000-0000-0000-0000-000000000002']::uuid[])$q$, '%past closing%');
-- inactive add-on not newly addable; inactive service not switchable to
select sqltest.expect_error($q$select public.set_booking_service_addons((select cy from ids), 'dddd0000-0000-0000-0000-000000000001', array['add00000-0000-0000-0000-000000000003']::uuid[])$q$, '%add-ons isn''t available%');
select sqltest.expect_error($q$select public.set_booking_service_addons((select cy from ids), 'dddd0000-0000-0000-0000-000000000003', null)$q$, '%service isn''t available%');
reset role;
-- another business's owner and the public can't touch it
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
select sqltest.expect_error($q$select public.set_booking_service_addons((select bea from ids), 'dddd0000-0000-0000-0000-000000000001', null)$q$, '%Booking not found%');
reset role;
select sqltest.as_anon();
select sqltest.expect_error($q$select public.set_booking_service_addons((select bea from ids), 'dddd0000-0000-0000-0000-000000000001', null)$q$, '%permission denied%');
