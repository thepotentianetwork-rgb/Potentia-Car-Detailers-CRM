-- TEST: booking_services exists with RLS, clients can only read it; set_booking_services is SECURITY DEFINER, staff-only; the picker helper is internal; one signature per booking function
do $$
declare r record; f text;
begin
  assert to_regclass('public.booking_services') is not null, 'booking_services missing';
  assert (select relrowsecurity from pg_class where oid = 'public.booking_services'::regclass), 'booking_services RLS off';
  assert not has_table_privilege('anon', 'public.booking_services', 'select'), 'anon must not read booking_services';
  assert has_table_privilege('authenticated', 'public.booking_services', 'select'), 'authenticated should read (RLS-limited)';
  assert not has_table_privilege('authenticated', 'public.booking_services', 'insert'), 'clients must not insert booking_services';
  assert not has_table_privilege('authenticated', 'public.booking_services', 'update'), 'clients must not update booking_services';
  assert not has_table_privilege('authenticated', 'public.booking_services', 'delete'), 'clients must not delete booking_services';
  foreach f in array array['public.set_booking_services(uuid,uuid[])', 'public.pick_booking_services(uuid,uuid[],uuid[])'] loop
    select p.prosecdef, p.proconfig into r from pg_proc p where p.oid = to_regprocedure(f);
    assert found, format('%s missing', f);
    assert r.prosecdef, format('%s must be SECURITY DEFINER', f);
    assert r.proconfig @> array['search_path=""'], format('%s search_path must be empty', f);
  end loop;
  assert not has_function_privilege('anon', 'public.set_booking_services(uuid,uuid[])', 'execute'), 'anon must not edit services';
  assert has_function_privilege('authenticated', 'public.set_booking_services(uuid,uuid[])', 'execute'), 'staff must edit services';
  assert not has_function_privilege('anon', 'public.pick_booking_services(uuid,uuid[],uuid[])', 'execute'), 'picker must be internal';
  assert not has_function_privilege('authenticated', 'public.pick_booking_services(uuid,uuid[],uuid[])', 'execute'), 'picker must be internal';
  assert (select count(*) from pg_proc where proname = 'request_booking' and pronamespace = 'public'::regnamespace) = 1, 'one request_booking expected';
  assert (select count(*) from pg_proc where proname = 'create_manual_booking' and pronamespace = 'public'::regnamespace) = 1, 'one create_manual_booking expected';
  -- nothing from the add-on era is dropped
  assert to_regclass('public.service_addons') is not null and to_regclass('public.booking_addons') is not null, 'add-on tables must stay';
end $$;
