-- TEST: signup trigger stores phone/ZIP/email from signup metadata and drops junk instead of failing
insert into auth.users (email, raw_user_meta_data) values
  ('new@example.com', '{"full_name":"New Person","tenant_slug":"shop-a","phone":"(555) 201-0099","zip":"80301"}'),
  ('junk@example.com', '{"full_name":"Junk","tenant_slug":"shop-a","phone":"12","zip":"abc"}'),
  ('old@example.com', '{"full_name":"Old Client","tenant_slug":"shop-a"}');
do $$ begin
  assert (select phone || '/' || zip || '/' || email || '/' || source from public.profiles where full_name = 'New Person') = '5552010099/80301/new@example.com/account', 'signup metadata not stored';
  assert (select phone is null and zip is null from public.profiles where full_name = 'Junk'), 'junk metadata should be dropped, not stored';
  assert (select phone is null and zip is null and role = 'customer' from public.profiles where full_name = 'Old Client'), 'signup without phone/zip must still work';
end $$;
