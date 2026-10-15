-- TEST: Juan's shop (guest_match_existing): guest bookings attach to the existing customer by phone, else email (phone wins), never overwrite stored data, never match staff/other shops; other shops still create a new guest each time
update public.bookings set created_at = now() - interval '3 days';
insert into public.profiles (id, full_name, phone, email, zip, role, tenant_id, source) values
  ('59990000-0000-0000-0000-000000000001', 'Ana Account', '(435) 555-0101', 'ana@example.com', null, 'customer', '55555555-5555-5555-5555-555555555555', 'account'),
  ('59990000-0000-0000-0000-000000000002', 'Gus Guest', '4355550202', null, null, 'customer', '55555555-5555-5555-5555-555555555555', 'guest'),
  ('59990000-0000-0000-0000-000000000003', 'Eva Email', '4355550303', ' Eva@Example.com ', '84337', 'customer', '55555555-5555-5555-5555-555555555555', 'staff'),
  ('59990000-0000-0000-0000-000000000004', 'Sam Staff', '4355550404', 'sam@example.com', null, 'staff', '55555555-5555-5555-5555-555555555555', 'account'),
  ('59990000-0000-0000-0000-000000000005', 'Other Shop Guest', '4355550101', null, null, 'customer', '11111111-1111-1111-1111-111111111111', 'guest');
insert into public.vehicles (profile_id, tenant_id, label, is_primary) values ('59990000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '2021 Honda CR-V', true);
create temp table r (k text, booking_id uuid, booking_date date, start_time time, status text);
grant all on r to anon, authenticated;
select sqltest.as_anon();
-- 1. phone match (formatted differently, different name/email entered) -> Ana's account profile
insert into r select 'phone', * from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 41)), '09:00','dropoff','2021 honda cr-v ','Red',null,'Someone Else','+1 435-555-0101','new@example.com','84000');
-- 2. email match only (new phone; email case/space differ) -> Eva (staff-added customer)
insert into r select 'email', * from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 42)), '09:00','dropoff','Ford Ranger',null,null,'E. Email','4355559999','EVA@example.COM',null);
-- 3. phone matches Gus, email matches Ana -> phone wins (Gus); Gus's blank email/zip get filled
insert into r select 'conflict', * from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 43)), '09:00','dropoff','Jeep',null,null,'Gustavo New Name','4355550202','ana@example.com','84337');
-- 4. staff member's phone -> NOT matched (new guest)
insert into r select 'staffphone', * from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 44)), '09:00','dropoff','Kia',null,null,'Not Sam','4355550404',null,null);
-- 5. nobody -> new guest
insert into r select 'new', * from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 45)), '09:00','dropoff','Mazda',null,null,'Nina New','4355550505','nina@example.com',null);
reset role;
select sqltest.as_anon();
-- 6. another shop (flag off) with a phone that exists there -> still a new guest profile
insert into r select 'othershop', * from public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001',
  (select ((now() at time zone 'America/Denver')::date + 46)), '09:00','dropoff','Civic',null,null,'Other Person','4355550101',null,null);
reset role;
do $$ declare pid uuid; n int; begin
  -- same response shape and status every time: nothing reveals a match
  assert (select count(*) from r where status = 'pending' and booking_id is not null) = 6, 'every request returns a pending booking';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'phone');
  assert pid = '59990000-0000-0000-0000-000000000001', 'phone match must attach to Ana';
  assert (select full_name || '|' || phone || '|' || email || '|' || coalesce(zip, '-') from public.profiles where id = pid)
         = 'Ana Account|(435) 555-0101|ana@example.com|-', 'account profile must not be changed';
  assert (select count(*) from public.vehicles where profile_id = pid) = 1, 'same vehicle label must be reused';
  assert (select color from public.vehicles where profile_id = pid) = 'Red', 'blank vehicle color filled';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'email');
  assert pid = '59990000-0000-0000-0000-000000000003', 'email match must attach to Eva';
  assert (select phone from public.profiles where id = pid) = '4355550303', 'staff-added profile untouched';
  assert (select is_primary from public.vehicles where profile_id = pid) = true, 'first vehicle of a matched customer is primary';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'conflict');
  assert pid = '59990000-0000-0000-0000-000000000002', 'phone must win over email';
  assert (select full_name || '|' || email || '|' || zip from public.profiles where id = pid) = 'Gus Guest|ana@example.com|84337',
         'guest profile: name kept, blank email/zip filled';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'staffphone');
  assert pid <> '59990000-0000-0000-0000-000000000004' and (select source from public.profiles where id = pid) = 'guest', 'staff profile never matched';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'new');
  assert (select full_name || '|' || source from public.profiles where id = pid) = 'Nina New|guest', 'no match -> new guest';
  select profile_id into pid from public.bookings where id = (select booking_id from r where k = 'othershop');
  assert pid <> '59990000-0000-0000-0000-000000000005' and (select full_name from public.profiles where id = pid) = 'Other Person', 'other shops unchanged: new guest';
  select count(*) into n from public.profiles where tenant_id = '55555555-5555-5555-5555-555555555555' and phone in ('4355550101','+1 435-555-0101','4355550202','4355559999');
  assert n = 0 + (select count(*) from public.profiles where id = '59990000-0000-0000-0000-000000000002'), 'no duplicate profiles for matched customers';
end $$;
-- pending cap follows the matched customer (Ana already has 1 pending; 2nd ok, 3rd refused)
select sqltest.as_anon();
select booking_id is not null from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009',
  (select ((now() at time zone 'America/Denver')::date + 47)), '09:00','dropoff','CR-V',null,null,'Ana','4355550101',null,null);
select sqltest.expect_error(format($q$select public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', %s, '10:00','dropoff','CR-V',null,null,'Ana','4355550101',null,null)$q$, sqltest.d(48)), '%already have requests waiting%');
reset role;
do $$ begin
  assert (select guest_match_existing from public.tenants where slug = 'shop-a') = false, 'default off';
  assert has_function_privilege('anon', 'public.normalize_us_phone(text)', 'execute') = false, 'helper not exposed';
end $$;
