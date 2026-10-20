-- spanish-migration.sql: optional Spanish service names/descriptions for the
-- customer portal's English/Español toggle (Juan's Auto Detailing first).
--
-- Why: Juan's customer pages can now be shown in Spanish. Service names and
-- descriptions come from the database, so they need Spanish fields. Both are
-- OPTIONAL: when blank, the portal shows the English name/description.
--
-- Safe to run more than once. Adds two nullable columns (no rewrite, no
-- change to existing rows except filling the Spanish fields of Juan's
-- services that are still blank). No function, policy or grant changes:
-- services already has table-level SELECT for anon/authenticated (public
-- read of active services) and UPDATE for staff via the existing RLS policy,
-- so the new columns are covered by the same rules.
--
-- STATUS: NOT APPLIED. Until it is, the portal falls back to English names.
begin;

-- 1. Columns (limits match the English fields' form limits).
alter table public.services add column if not exists name_es text;
alter table public.services add column if not exists description_es text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_name_es_len') then
    alter table public.services add constraint services_name_es_len
      check (name_es is null or char_length(name_es) between 2 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'services_description_es_len') then
    alter table public.services add constraint services_description_es_len
      check (description_es is null or char_length(description_es) <= 1000);
  end if;
end $$;

-- 2. Spanish for Juan's 11 active services (names as read live 2026-10-20).
--    Matched by exact English name within Juan's shop; only blank Spanish
--    fields are filled, so re-running never overwrites Juan's own edits.
--    Descriptions are the homepage's "includes" lines (one per line).
with t as (select id from public.tenants where slug = 'juans-auto-detailing'),
es(name, name_es, description_es) as (values
  ('Regular — Interior & Exterior', 'Regular — Interior y exterior',
   E'Aspirado y limpieza del interior\nVidrios por dentro y por fuera\nLavado a mano y limpieza de rines\nAbrillantador de llantas'),
  ('Medium — Interior, Shampoo & Exterior', 'Mediano — Interior, lavado de tapicería y exterior',
   E'Todo lo del Regular\nLavado de alfombras y tapicería\nTratamiento de manchas en los asientos'),
  ('Super — Interior, Shampoo, Exterior & Engine', 'Súper — Interior, lavado de tapicería, exterior y motor',
   E'Todo lo del Mediano\nLimpieza y desengrasado del motor\nAbrillantador de motor'),
  ('Full Detail — Everything + Wax', 'Detallado completo — Todo + cera',
   E'Todo lo del Súper\nCera aplicada a mano en el exterior\nAbrillantador de molduras y pulido de vidrios'),
  ('Interior Only', 'Solo interior',
   'Aspirado, limpieza, vidrios y abrillantador de molduras. Sin trabajo en el exterior.'),
  ('Exterior Only', 'Solo exterior',
   'Lavado a mano y limpieza de rines. Sin trabajo en el interior.'),
  ('Paint Polish', 'Pulido de pintura',
   'Elimina marcas de remolino y rayones; devuelve la profundidad y el brillo.'),
  ('Polish + Ceramic Coat', 'Pulido + recubrimiento cerámico',
   'Pulido completo a máquina más un recubrimiento cerámico de grado profesional que repele el agua y la suciedad por años.'),
  ('Headlight Restoration', 'Restauración de faros',
   'Aclara los faros opacos y amarillentos para que veas mejor de noche.'),
  ('Pet Hair Removal', 'Eliminación de pelo de mascota',
   'Extracción profunda en asientos, alfombras y cajuela.'),
  ('Odor Removal', 'Eliminación de olores',
   'Elimina olores a cigarro, mascotas y humedad desde la raíz.'))
update public.services s
   set name_es = coalesce(s.name_es, es.name_es),
       description_es = coalesce(s.description_es, es.description_es)
  from t, es
 where s.tenant_id = t.id and s.name = es.name
   and (s.name_es is null or s.description_es is null);

commit;

-- Read-only check after applying (expect 11 rows with name_es set):
-- select s.name, s.name_es, s.active from public.services s
--   join public.tenants t on t.id = s.tenant_id
--  where t.slug = 'juans-auto-detailing' order by s.sort_order;
