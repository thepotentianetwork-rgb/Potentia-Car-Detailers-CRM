-- TEST: request_booking is SECURITY DEFINER with an empty search_path, callable by anon/authenticated; the helper is not
do $$
declare r record;
begin
  select p.prosecdef, p.proconfig into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_booking';
  assert found, 'request_booking() missing';
  assert r.prosecdef, 'request_booking must be SECURITY DEFINER';
  assert r.proconfig @> array['search_path=""'], format('request_booking search_path must be empty, got %s', r.proconfig);
  assert has_function_privilege('anon', 'public.request_booking(text,uuid,date,time,text,text,text,text,text,text,text,text)', 'execute'), 'anon cannot execute request_booking';
  assert has_function_privilege('authenticated', 'public.request_booking(text,uuid,date,time,text,text,text,text,text,text,text,text)', 'execute'), 'authenticated cannot execute request_booking';
  assert not has_function_privilege('anon', 'public.hm12_to_minutes(text)', 'execute'), 'anon should not execute hm12_to_minutes';
  assert not has_function_privilege('authenticated', 'public.hm12_to_minutes(text)', 'execute'), 'authenticated should not execute hm12_to_minutes';
  assert public.hm12_to_minutes('12:00 AM') = 0 and public.hm12_to_minutes('12:30 PM') = 750 and public.hm12_to_minutes('9:05 pm') = 1265, 'hm12_to_minutes wrong';
end $$;
