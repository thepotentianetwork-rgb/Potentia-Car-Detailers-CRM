-- TEST: overlap with existing bookings and the mobile travel buffer are enforced server-side
select sqltest.as_anon();
-- seeded approved booking at +3d 10:00-11:00; t02 booked +2d 09:00-10:00
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '10:30','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010002',null,null)$q$, sqltest.d(3)), '%just taken%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '09:30','dropoff','2019 Kia Soul',null,null,'Al Guest','5552010002',null,null)$q$, sqltest.d(2)), '%just taken%');
-- mobile needs a 15-min buffer either side: 11:00 mobile collides with 10:00-11:00, 11:30 mobile is fine
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '11:00','mobile','2019 Kia Soul',null,'1 Main St','Al Guest','5552010002',null,'80202')$q$, sqltest.d(3)), '%just taken%');
select booking_id is not null as mobile_1130_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', (select ((now() at time zone 'America/Denver')::date + 3)), '11:30','mobile','2019 Kia Soul',null,'1 Main St','Al Guest','5552010002',null,'80202');
-- declined bookings free their slot
reset role;
update public.bookings set status = 'declined'
 where booking_date = (now() at time zone 'America/Denver')::date + 2 and start_time = '09:00';
select sqltest.as_anon();
select booking_id is not null as declined_slot_reusable from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', (select ((now() at time zone 'America/Denver')::date + 2)), '09:00','dropoff','2019 Kia Soul',null,null,'Bo Guest','5552010005',null,null);
