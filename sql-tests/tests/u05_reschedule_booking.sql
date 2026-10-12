-- TEST: staff reschedule: FULL duration must fit open hours, the slot grid and the future, must not overlap others (itself excluded, mobile buffer applied); status kept
-- d5 Bea pending 11:30 (120). d7: Walk Dee approved 10:00-11:30, Cust D 11:30-12:30. d8: mobile 14:00-15:00 (+15 buffer each side).
create temp table ids as select
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5553000002' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as bea,
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5553000003' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as cy,
  (select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Walk Dee' and b.tenant_id = '44444444-4444-4444-4444-444444444444') as walk;
grant select on ids to authenticated, anon;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select * from public.reschedule_booking((select bea from ids), (select ((now() at time zone 'America/Denver')::date + 7)), '13:00');
do $$ declare b record; begin
  select * into b from public.bookings where id = (select bea from ids);
  assert b.booking_date = (now() at time zone 'America/Denver')::date + 7 and b.start_time = '13:00', 'Bea not moved';
  assert b.status = 'pending', 'reschedule must keep status';
  assert b.duration_min = 120, 'reschedule must keep duration';
end $$;
-- moving within its own old span is fine (it doesn't collide with itself)
select * from public.reschedule_booking((select bea from ids), (select ((now() at time zone 'America/Denver')::date + 7)), '13:30');
-- 12:00 overlaps Cust D (11:30-12:30); 16:00 + 120 runs past closing; 8:00 is before opening; 13:15 is off the 30-min grid; yesterday is past
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '12:00')$q$, sqltest.d(7)), '%overlap another booking%');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '16:00')$q$, sqltest.d(7)), '%past closing%');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '08:00')$q$, sqltest.d(7)), '%outside business hours%');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '13:15')$q$, sqltest.d(7)), '%outside business hours%');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '13:00')$q$, sqltest.d(-1)), '%already passed%');
-- approved booking moves and stays approved; the mobile buffer counts: dropoff 12:30-14:00 hits mobile's 13:45, 12:00-13:30 doesn't
select sqltest.expect_error(format($q$select public.reschedule_booking((select walk from ids), %s, '12:30')$q$, sqltest.d(8)), '%overlap another booking%');
select * from public.reschedule_booking((select walk from ids), (select ((now() at time zone 'America/Denver')::date + 8)), '12:00');
do $$ begin
  assert (select status from public.bookings where id = (select walk from ids)) = 'approved', 'approved booking must stay approved';
end $$;
reset role;
update public.bookings set status = 'completed' where id = (select cy from ids);
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select sqltest.expect_error(format($q$select public.reschedule_booking((select cy from ids), %s, '09:00')$q$, sqltest.d(9)), '%Only pending or approved%');
reset role;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '09:00')$q$, sqltest.d(9)), '%Booking not found%');
reset role;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000005');
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '09:00')$q$, sqltest.d(9)), '%Booking not found%');
reset role;
select sqltest.as_anon();
select sqltest.expect_error(format($q$select public.reschedule_booking((select bea from ids), %s, '09:00')$q$, sqltest.d(9)), '%permission denied%');
