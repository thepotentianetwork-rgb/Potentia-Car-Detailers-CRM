-- TEST: Juan's: Headlight/Pet Hair/Odor are active services again at $45/$35/$65 and 30 min, their add-ons are off, Paint Polish and Polish + Ceramic exist once each, past bookings and add-on history untouched, anyone can book just Pet Hair Removal
do $$ begin
  assert (select string_agg(name || ':' || price_cents || ':' || duration_min, ',' order by sort_order)
            from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and active)
         = 'Exterior Only:7500:90,Paint Polish:40000:300,Polish + Ceramic Coat:60000:480,Headlight Restoration:4500:30,Pet Hair Removal:3500:30,Odor Removal:6500:30',
         format('Juan active services wrong: %s', (select string_agg(name || ':' || price_cents || ':' || duration_min, ',' order by sort_order) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and active));
  assert (select count(*) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555') = 6, 'no services may be added or deleted on live-shaped data';
  assert (select count(*) from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555') = 3, 'add-ons must not be deleted';
  assert not exists (select 1 from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555' and active), 'Juan add-ons should be inactive';
  -- past bookings exactly as before
  assert (select service_id || ':' || duration_min || ':' || price_cents || ':' || status from public.bookings where id = '55550000-2222-0000-0000-000000000001')
         = '55550000-0000-0000-0000-000000000010:30:3500:completed', 'past booking changed';
  assert (select service_id || ':' || duration_min || ':' || price_cents from public.bookings where id = '55550000-2222-0000-0000-000000000002')
         = '55550000-0000-0000-0000-000000000001:120:11000', 'add-on era booking changed';
  assert (select string_agg(name || ':' || price_cents || ':' || extra_duration_min, ',') from public.booking_addons where booking_id = '55550000-2222-0000-0000-000000000002')
         = 'Pet Hair Removal:3500:30', 'booking_addons history changed';
  assert not exists (select 1 from public.booking_services where booking_id in ('55550000-2222-0000-0000-000000000001', '55550000-2222-0000-0000-000000000002')), 'past bookings must not get booking_services rows';
end $$;
create temp table juan_addons as select array_agg(id) ids from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555';
grant select on juan_addons to anon;
select sqltest.as_anon();
do $$ begin
  assert (select count(*) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555') = 6, 'public should see the 6 active Juan services';
end $$;
select booking_id is not null as pet_only from public.request_booking(p_tenant_slug => 'juans-auto-detailing', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 2)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => 'Subaru', p_guest_name => 'Pet Owner', p_guest_phone => '5558000001',
  p_service_ids => array['55550000-0000-0000-0000-000000000010']::uuid[]);
select booking_id is not null as polish_plus from public.request_booking(p_tenant_slug => 'juans-auto-detailing', p_service_id => null,
  p_booking_date => (select ((now() at time zone 'America/Denver')::date + 3)), p_start_time => '09:00', p_type => 'dropoff',
  p_vehicle_label => 'Tesla', p_guest_name => 'Shiny Car', p_guest_phone => '5558000002',
  p_service_ids => array['55550000-0000-0000-0000-000000000007','55550000-0000-0000-0000-000000000009','55550000-0000-0000-0000-000000000011']::uuid[]);
-- the old frontend's add-on path is closed for Juan's now (add-ons inactive)
select sqltest.expect_error(format($q$select public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000001', %s, '13:00','dropoff','Car',null,null,'Old Ui','5558000003',null,null,
  (select ids from juan_addons))$q$, sqltest.d(4)), '%add-ons isn''t available%');
reset role;
do $$ begin
  assert (select duration_min || ':' || price_cents from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5558000001') = '30:3500', 'Pet-only Juan booking wrong';
  assert (select duration_min || ':' || price_cents from public.bookings b join public.profiles p on p.id = b.profile_id where p.phone = '5558000002') = '360:51000', 'Polish + Headlight + Odor booking wrong';
end $$;
