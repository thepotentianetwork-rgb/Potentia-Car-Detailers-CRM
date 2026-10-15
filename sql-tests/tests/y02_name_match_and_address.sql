-- TEST: Juan's shop recognises a returning customer by a UNIQUE normalised name with no conflicting stored phone/email (ambiguous or conflicting -> new guest); mobile bookings need street, city and ZIP in request_booking and create_manual_booking (all shops)
\set ON_ERROR_STOP 1
update public.bookings set created_at = now() - interval '3 days';
-- seed Juan customers (+ two blank-contact "Kim Diaz"): unique "Maria  Lopez" (no phone/email), two "Sam Reed", "Pat Kim" with another phone, "Lee Ann" with another email
insert into public.profiles (id, tenant_id, role, source, full_name, phone, email) values
 ('77770000-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','customer','guest','Maria  Lopez',null,null),
 ('77770000-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','customer','guest','Sam Reed','5550001111',null),
 ('77770000-0000-0000-0000-000000000003','55555555-5555-5555-5555-555555555555','customer','guest','sam reed','5550002222',null),
 ('77770000-0000-0000-0000-000000000004','55555555-5555-5555-5555-555555555555','customer','guest','Pat Kim','5550003333',null),
 ('77770000-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','customer','guest','Lee Ann',null,'lee@old.example'),
 ('77770000-0000-0000-0000-000000000006','55555555-5555-5555-5555-555555555555','customer','guest','Kim Diaz',null,null),
 ('77770000-0000-0000-0000-000000000007','55555555-5555-5555-5555-555555555555','customer','guest','KIM  DIAZ',null,null);
select sqltest.as_anon();
create temp table nm(k text, id uuid);
grant all on nm to anon, authenticated;
insert into nm select 'maria', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(4)::date, '10:00','dropoff','Civic',null,null,' maria lopez ','5559990001',null,null);
insert into nm select 'sam', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(4)::date, '11:00','dropoff','Civic',null,null,'Sam Reed','5559990002',null,null);
insert into nm select 'pat', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(4)::date, '12:00','dropoff','Civic',null,null,'Pat Kim','5559990003',null,null);
insert into nm select 'lee', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(4)::date, '13:00','dropoff','Civic',null,null,'Lee Ann','5559990004','lee@new.example',null);
insert into nm select 'kim', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(4)::date, '14:00','dropoff','Civic',null,null,'Kim Diaz','5559990008',null,null);
-- mobile without a full address is rejected (all shops)
select sqltest.expect_error(format($q$select public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', %s, '14:00','mobile','Civic',null,'12 Oak St','Al Mobile','5559990005',null,'84337')$q$, sqltest.d(5)), '%full service address%');
select sqltest.expect_error(format($q$select public.request_booking('shop-a','aaaaaaaa-0000-0000-0000-000000000001', %s, '14:00','mobile','Civic',null,'Tremonton 84337','Al Mobile','5559990006',null,'84337')$q$, sqltest.d(5)), '%full service address%');
insert into nm select 'mob', booking_id from public.request_booking('juans-auto-detailing','55550000-0000-0000-0000-000000000009', sqltest.d(5)::date, '14:00','mobile','Civic',null,'12 Oak St, Tremonton 84337','Al Mobile','5559990007',null,null);
reset role;
do $$
declare r record;
begin
  select b.profile_id into r from public.bookings b join nm on nm.id=b.id where k='maria';
  if r.profile_id <> '77770000-0000-0000-0000-000000000001' then raise exception 'unique name not matched'; end if;
  if (select full_name from public.profiles where id='77770000-0000-0000-0000-000000000001') <> 'Maria  Lopez' then raise exception 'name overwritten'; end if;
  if (select phone from public.profiles where id='77770000-0000-0000-0000-000000000001') is null then raise exception 'blank phone not filled'; end if;
  if (select b.profile_id from public.bookings b join nm on nm.id=b.id where k='sam') in ('77770000-0000-0000-0000-000000000002','77770000-0000-0000-0000-000000000003') then raise exception 'ambiguous name matched'; end if;
  if (select b.profile_id from public.bookings b join nm on nm.id=b.id where k='kim') in ('77770000-0000-0000-0000-000000000006','77770000-0000-0000-0000-000000000007') then raise exception 'ambiguous blank-contact name matched'; end if;
  if (select p.source from public.bookings b join nm on nm.id=b.id join public.profiles p on p.id=b.profile_id where k='kim') <> 'guest' then raise exception 'no new guest'; end if;
  if (select b.profile_id from public.bookings b join nm on nm.id=b.id where k='pat') = '77770000-0000-0000-0000-000000000004' then raise exception 'name matched despite conflicting phone'; end if;
  if (select b.profile_id from public.bookings b join nm on nm.id=b.id where k='lee') = '77770000-0000-0000-0000-000000000005' then raise exception 'name matched despite conflicting email'; end if;
  if (select phone from public.profiles where id='77770000-0000-0000-0000-000000000004') <> '5550003333' then raise exception 'conflicting profile changed'; end if;
  if (select mobile_address from public.bookings b join nm on nm.id=b.id where k='mob') <> '12 Oak St, Tremonton 84337' then raise exception 'address not stored'; end if;
  if (select p.zip from public.bookings b join nm on nm.id=b.id join public.profiles p on p.id=b.profile_id where k='mob') <> '84337' then raise exception 'zip not derived'; end if;
end $$;
-- staff Add Booking: mobile needs the full address too
select sqltest.as_user('dddddddd-0000-0000-0000-000000000004');
select sqltest.expect_error($q$select public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001',(select ((now() at time zone 'America/Denver')::date + 9)), '10:00','mobile','Van','dddddddd-0000-0000-0000-000000000005', null, null, null, '9 Elm St')$q$, '%full service address%');
reset role;
