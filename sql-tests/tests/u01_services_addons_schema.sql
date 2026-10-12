-- TEST: services get description + sanity checks, the public sees only active services/add-ons, add-ons are staff-managed, no deletes
do $$ begin
  assert exists (select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='description'), 'services.description missing';
  assert to_regclass('public.service_addons') is not null, 'service_addons table missing';
  assert to_regclass('public.booking_addons') is not null, 'booking_addons table missing';
end $$;
select sqltest.expect_error($q$update public.services set duration_min = 5 where id = 'dddd0000-0000-0000-0000-000000000001'$q$, '%services_duration_range%');
select sqltest.expect_error($q$update public.services set price_cents = -1 where id = 'dddd0000-0000-0000-0000-000000000001'$q$, '%services_price_range%');
-- owner D manages the add-on catalog (any number of add-ons)
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
insert into public.service_addons (id, tenant_id, name, price_cents, extra_duration_min, sort_order, active) values
  ('add00000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Pet Hair Removal', 3500, 30, 1, true),
  ('add00000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Headlight Restoration', 5000, 60, 2, true),
  ('add00000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'Odor Removal', 2000, 15, 3, false),
  ('add00000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'Tire Shine', 1000, 0, 4, true);
update public.services set description = 'Hand wash' || chr(10) || 'Tire dressing' where id = 'dddd0000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.services where tenant_id = '44444444-4444-4444-4444-444444444444') = 3, 'owner must see inactive services';
  assert (select count(*) from public.service_addons where tenant_id = '44444444-4444-4444-4444-444444444444') = 4, 'owner must see inactive add-ons';
end $$;
select sqltest.expect_error($q$delete from public.services where id = 'dddd0000-0000-0000-0000-000000000003'$q$, '%permission denied%');
select sqltest.expect_error($q$delete from public.service_addons where id = 'add00000-0000-0000-0000-000000000003'$q$, '%permission denied%');
-- another tenant's owner cannot add to shop D's catalog
reset role;
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
select sqltest.expect_error($q$insert into public.service_addons (tenant_id, name, price_cents) values ('44444444-4444-4444-4444-444444444444', 'Sneaky', 1)$q$, '%row-level security%');
insert into public.service_addons (id, tenant_id, name, price_cents, extra_duration_min) values
  ('add00000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Shop A Wax', 2500, 30);
reset role;
-- the public: active only, read-only
select sqltest.as_anon();
do $$ begin
  assert (select count(*) from public.services where tenant_id = '44444444-4444-4444-4444-444444444444') = 2, 'anon must not see inactive services';
  assert (select count(*) from public.service_addons where tenant_id = '44444444-4444-4444-4444-444444444444') = 3, 'anon must see only active add-ons';
end $$;
select sqltest.expect_error($q$insert into public.service_addons (tenant_id, name, price_cents) values ('44444444-4444-4444-4444-444444444444', 'Free stuff', 0)$q$, '%permission denied%');
select sqltest.expect_error($q$update public.services set price_cents = 1$q$, '%permission denied%');
select sqltest.expect_error($q$select * from public.booking_addons$q$, '%permission denied%');
