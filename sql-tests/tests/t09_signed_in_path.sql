-- TEST: signed-in customer books via the same function; other tenants and staff are rejected; owner sees guests
select sqltest.as_user('cccccccc-0000-0000-0000-000000000001');
select booking_id is not null as customer_ok from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', (select ((now() at time zone 'America/Denver')::date + 8)), '09:00','dropoff','2022 Subaru Outback');
select sqltest.expect_error(format($q$select public.request_booking('shop-b','bbbbbbbb-0000-0000-0000-000000000001', %s, '09:00','dropoff','2022 Subaru Outback')$q$, sqltest.d(8)), '%can''t book with this business%');
reset role;
do $$ begin
  assert (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
           where p.id = 'cccccccc-0000-0000-0000-000000000001' and b.status = 'pending' and b.price_cents = 5000) = 1,
         'signed-in booking not stored on the customer''s own profile as pending';
end $$;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '14:00','dropoff','2022 Subaru Outback')$q$, sqltest.d(8)), '%can''t book with this business%');
-- the owner's dashboard query can see guest name/phone/email/zip
do $$ begin
  assert (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
           where p.source = 'guest' and p.phone is not null) >= 3, 'owner cannot see guest bookings+profiles';
  assert (select email from public.profiles where phone = '5552010001') = 'gina@example.com', 'owner cannot see guest email';
end $$;
