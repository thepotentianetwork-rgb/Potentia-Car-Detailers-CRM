-- TEST: new booking functions are SECURITY DEFINER with an empty search_path; staff ones are not callable by anon; the slot helper by nobody
do $$
declare r record; f text;
begin
  foreach f in array array['public.set_booking_service_addons(uuid,uuid,uuid[])', 'public.reschedule_booking(uuid,date,time)',
      'public.create_manual_booking(uuid,uuid,date,time,text,text,uuid,text,text,uuid,text,uuid[])',
      'public.assert_staff_slot(uuid,date,time,int,text,uuid,boolean)',
      'public.request_booking(text,uuid,date,time,text,text,text,text,text,text,text,text,uuid[])'] loop
    select p.prosecdef, p.proconfig into r from pg_proc p where p.oid = to_regprocedure(f);
    assert found, format('%s missing', f);
    assert r.prosecdef, format('%s must be SECURITY DEFINER', f);
    assert r.proconfig @> array['search_path=""'], format('%s search_path must be empty', f);
  end loop;
  assert not has_function_privilege('anon', 'public.reschedule_booking(uuid,date,time)', 'execute'), 'anon must not reschedule';
  assert not has_function_privilege('anon', 'public.set_booking_service_addons(uuid,uuid,uuid[])', 'execute'), 'anon must not edit add-ons';
  assert not has_function_privilege('anon', 'public.create_manual_booking(uuid,uuid,date,time,text,text,uuid,text,text,uuid,text,uuid[])', 'execute'), 'anon must not create manual bookings';
  assert not has_function_privilege('authenticated', 'public.assert_staff_slot(uuid,date,time,int,text,uuid,boolean)', 'execute'), 'slot helper must be internal';
  assert not has_function_privilege('anon', 'public.assert_staff_slot(uuid,date,time,int,text,uuid,boolean)', 'execute'), 'slot helper must be internal';
  assert has_function_privilege('anon', 'public.request_booking(text,uuid,date,time,text,text,text,text,text,text,text,text,uuid[])', 'execute'), 'anon must still book';
end $$;
