-- TEST: section 6 moved Juan's Headlight/Pet Hair/Odor services to add-ons at their prices/minutes, deactivated (not deleted) the services, past bookings intact
do $$ begin
  assert (select string_agg(name || ':' || price_cents || ':' || extra_duration_min || ':' || active, ',' order by sort_order)
            from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555')
         = 'Headlight Restoration:4500:30:true,Pet Hair Removal:3500:30:true,Odor Removal:6500:30:true', 'Juan add-ons wrong';
  assert (select count(*) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555') = 4, 'services must not be deleted';
  assert (select count(*) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and active) = 1, 'only Exterior Only should stay active';
  assert (select service_id from public.bookings where id = '55550000-2222-0000-0000-000000000001') = '55550000-0000-0000-0000-000000000010', 'past booking changed';
end $$;
-- the public no longer sees them as services, but can book them as add-ons
select sqltest.as_anon();
do $$ begin
  assert (select count(*) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555') = 1, 'anon still sees moved services';
end $$;
select booking_id is not null as ok from public.request_booking('juans-auto-detailing', '55550000-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 2)), '09:00', 'dropoff', 'Car', null, null, 'Juan Guest', '5554000001', null, null,
  (select array_agg(id) from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555'));
reset role;
do $$ begin
  assert (select duration_min || ':' || price_cents from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5554000001') = '180:22000', 'Juan booking with 3 add-ons wrong';
end $$;
