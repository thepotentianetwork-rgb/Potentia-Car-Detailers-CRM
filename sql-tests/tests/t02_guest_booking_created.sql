-- TEST: anon can request a guest booking; server sets price, duration and status
select sqltest.as_anon();
select * from public.request_booking('shop-a', 'aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 2)), '09:00', 'dropoff', '2020 Honda Civic', 'Blue',
  null, 'Gina Guest', '(555) 201-0001', 'Gina@Example.com', '80202');
reset role;
do $$ begin
  assert (select count(*) from public.bookings b join public.profiles p on p.id = b.profile_id
           where p.source = 'guest' and p.phone = '5552010001' and p.zip = '80202' and p.email = 'gina@example.com'
             and p.full_name = 'Gina Guest' and p.role = 'customer' and p.tenant_id = b.tenant_id
             and b.status = 'pending' and b.price_cents = 5000 and b.duration_min = 60) = 1, 'guest booking not stored as expected';
  assert (select color from public.vehicles v join public.profiles p on p.id = v.profile_id where p.phone = '5552010001') = 'Blue', 'vehicle color missing';
end $$;
