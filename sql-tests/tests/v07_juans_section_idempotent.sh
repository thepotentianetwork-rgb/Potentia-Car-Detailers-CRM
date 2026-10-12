#!/usr/bin/env bash
# TEST: Juan's section is idempotent (re-run changes nothing) and adds Paint Polish / Polish + Ceramic at $400/300 min and $600/480 min only when missing
set -euo pipefail
q() { $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
block=$(sed -n '/^-- SECTION6-BEGIN/,/^-- SECTION6-END/p' ../multiservice-migration.sql)
[ -n "$block" ] || { echo "ERROR: section 6 block not found"; exit 1; }
snap() { q -At -c "select string_agg(name||':'||price_cents||':'||duration_min||':'||active, ',' order by name) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555'" \
            -c "select string_agg(name||':'||active, ',' order by name) from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555'"; }
before=$(snap)
echo "$block" | q
echo "$block" | q
after=$(snap)
[ "$before" = "$after" ] || { echo "ERROR: re-running section 6 changed data"; echo "before: $before"; echo "after:  $after"; exit 1; }
# without the two polish services (rolled back): the section inserts them once
out=$(q -At -c "begin" \
  -c "delete from public.bookings where service_id in (select id from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and name in ('Paint Polish', 'Polish + Ceramic Coat'))" \
  -c "delete from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and name in ('Paint Polish', 'Polish + Ceramic Coat')" \
  -c "$block" -c "$block" \
  -c "select string_agg(name||':'||price_cents||':'||duration_min||':'||active, ',' order by name) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555' and name ilike '%polish%'" \
  -c "rollback" | tail -1)
[ "$out" = "Paint Polish:40000:300:true,Polish + Ceramic:60000:480:true" ] || { echo "ERROR: missing polish services not inserted correctly: $out"; exit 1; }
