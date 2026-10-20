-- TEST: Spanish service fields: optional name_es/description_es exist, Juan's services get Spanish (only blanks filled, re-run safe), other shops untouched, anon can read them, length limits hold
\set ON_ERROR_STOP 1
do $$ begin
  assert (select count(*) from public.services s join public.tenants t on t.id = s.tenant_id
           where t.slug = 'juans-auto-detailing' and s.name_es is null) = 0, 'every Juan service should have a Spanish name';
  assert (select name_es from public.services where id = '55550000-0000-0000-0000-000000000009') = 'Restauración de faros', 'Headlight Spanish name';
  assert (select description_es from public.services where id = '55550000-0000-0000-0000-000000000001') like 'Lavado a mano%', 'Exterior Only Spanish description';
  assert not exists (select 1 from public.services s join public.tenants t on t.id = s.tenant_id
                      where t.slug <> 'juans-auto-detailing' and (s.name_es is not null or s.description_es is not null)), 'other shops must be untouched';
end $$;
-- Juan's own edit survives a re-run
update public.services set name_es = 'Faros como nuevos' where id = '55550000-0000-0000-0000-000000000009';
\i ../spanish-migration.sql
do $$ begin
  assert (select name_es from public.services where id = '55550000-0000-0000-0000-000000000009') = 'Faros como nuevos', 're-run overwrote an edit';
end $$;
-- limits
select sqltest.expect_error($q$update public.services set name_es = 'x' where id = '55550000-0000-0000-0000-000000000009'$q$, '%services_name_es_len%');
select sqltest.expect_error($q$update public.services set description_es = repeat('a', 1001) where id = '55550000-0000-0000-0000-000000000009'$q$, '%services_description_es_len%');
-- the public (anon) sees the Spanish name of an active service
select sqltest.as_anon();
do $$ begin
  assert (select name_es from public.services where id = '55550000-0000-0000-0000-000000000001') = 'Solo exterior', 'anon cannot read name_es';
end $$;
reset role;
