-- TEST: reschedule checks the FULL combined length of a multi-service booking: a gap shorter than the combined job is rejected, a long enough one works
select sqltest.as_user('66660000-1111-0000-0000-000000000001');
-- Pat -> Wash + Pet again (90 min)
select * from public.set_booking_services((select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Phone Pat'),
  array['66660000-0000-0000-0000-000000000001','66660000-0000-0000-0000-000000000002']::uuid[]);
-- day 7: blocker at 10:00-11:00
select booking_id is not null from public.create_manual_booking('66666666-6666-6666-6666-666666666666','66660000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 7)), '10:00','dropoff','Blocker', null, 'Blocker Bo');
-- 09:00 + 90 runs into 10:00 (a single 60-min service would fit): rejected
select sqltest.expect_error(format($q$select public.reschedule_booking((select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Phone Pat'), %s, '09:00')$q$, sqltest.d(7)), '%overlap another booking%');
select * from public.reschedule_booking((select b.id from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Phone Pat'),
  (select ((now() at time zone 'America/Denver')::date + 7)), '11:00');
reset role;
do $$ begin
  assert (select booking_date - (now() at time zone 'America/Denver')::date || ' ' || start_time || ' ' || duration_min
            from public.bookings b join public.profiles p on p.id = b.profile_id where p.full_name = 'Phone Pat') = '7 11:00:00 90', 'Pat not moved to day 7 11:00 with 90 min';
end $$;
