#!/usr/bin/env bash
# TEST: re-running section 6 adds no duplicate add-ons and leaves the services as they are
set -euo pipefail
q() { $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
block=$(sed -n '/^-- SECTION6-BEGIN/,/^-- SECTION6-END/p' ../services-addons-migration.sql)
[ -n "$block" ] || { echo "ERROR: section 6 block not found"; exit 1; }
echo "$block" | q
echo "$block" | q
n=$(q -At -c "select count(*) from public.service_addons where tenant_id = '55555555-5555-5555-5555-555555555555'")
s=$(q -At -c "select count(*) || '/' || count(*) filter (where active) from public.services where tenant_id = '55555555-5555-5555-5555-555555555555'")
[ "$n" = "3" ] && [ "$s" = "4/1" ] || { echo "ERROR: after re-run expected 3 add-ons and 4/1 services, got $n and $s"; exit 1; }
