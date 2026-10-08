-- TEST: new columns/constraints exist, staff-entered customers are backfilled to source 'staff', staff can still add customers
do $$ begin
  assert (select source from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'staff', 'staff-entered customer not backfilled to staff';
  assert (select source from public.profiles where id = 'cccccccc-0000-0000-0000-000000000001') = 'account', 'self-signup customer must stay account';
  assert (select source from public.profiles where id = 'dddddddd-0000-0000-0000-000000000001') = 'account', 'owner profile must not be relabelled';
end $$;
insert into public.tenants (name, slug) values ('Shop TZ', 'shop-tz');
do $$ begin assert (select timezone from public.tenants where slug = 'shop-tz') = 'America/Denver', 'tenants.timezone default'; end $$;
select sqltest.expect_error($q$insert into public.profiles (tenant_id, full_name, role, zip) values ('11111111-1111-1111-1111-111111111111','x','customer','abcde')$q$, '%profiles_zip_format%');
select sqltest.expect_error($q$insert into public.profiles (tenant_id, full_name, role, source) values ('11111111-1111-1111-1111-111111111111','x','customer','bogus')$q$, '%profiles_source_check%');
select sqltest.expect_error($q$insert into public.vehicles (profile_id, tenant_id, label, color) values ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Car', repeat('x', 31))$q$, '%vehicles_color_len%');
-- ManualBookingForm's createGuestCustomer(): owner inserts a source='staff' customer under RLS
select sqltest.as_user('dddddddd-0000-0000-0000-000000000001');
insert into public.profiles (tenant_id, full_name, phone, role, source) values ('11111111-1111-1111-1111-111111111111', 'Phone Caller', '5550001111', 'customer', 'staff');
reset role;
do $$ begin assert (select source from public.profiles where full_name = 'Phone Caller') = 'staff', 'staff customer insert failed'; end $$;
