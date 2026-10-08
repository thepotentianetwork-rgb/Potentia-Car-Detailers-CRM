#!/usr/bin/env bash
# SQL tests for guest-booking-migration.sql, run against a THROWAWAY local
# Postgres (never the live Supabase database). See README.md.
#
#   ./run.sh                  mock live schema -> apply migration -> run tests
#   ./run.sh --no-migration   same, without the migration (shows the tests failing)
#
# Env: SQLTEST_PSQL  psql command   (default: "sudo -u postgres psql")
#      SQLTEST_DB    database name  (default: crm_guest_test; dropped and recreated)
set -uo pipefail
cd "$(dirname "$0")"

MIGRATION=../guest-booking-migration.sql
export DB=${SQLTEST_DB:-crm_guest_test}
export PSQL=${SQLTEST_PSQL:-"sudo -u postgres psql"}

# Refuse anything that isn't a local server: this script drops databases.
case "${PGHOST:-}" in
  "" | localhost | 127.0.0.1 | ::1 | /*) ;;
  *) echo "Refusing to run: PGHOST=$PGHOST is not local. These tests drop and recreate '$DB'." >&2; exit 2 ;;
esac
if [ -n "${DATABASE_URL:-}${PGSERVICE:-}" ]; then
  echo "Refusing to run with DATABASE_URL/PGSERVICE set; unset them and use a local server." >&2; exit 2
fi

with_migration=1
[ "${1:-}" = "--no-migration" ] && with_migration=0

psql_q() { $PSQL -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null || exit 2
cat setup/00_mock_live_schema.sql setup/01_seed.sql setup/02_helpers.sql | psql_q -d "$DB" >/dev/null 2>&1 \
  || { echo "setup failed" >&2; exit 2; }

if [ $with_migration = 1 ]; then
  psql_q -d "$DB" -f "$MIGRATION" >/dev/null 2>&1 || { echo "migration failed to apply:" >&2; psql_q -d "$DB" -f "$MIGRATION" 2>&1 | grep -i error >&2; exit 2; }
  echo "Applied $MIGRATION (PARTS 0-4)"
else
  echo "NOT applying the migration (--no-migration)"
fi

pass=0; fail=0
run_test() {
  local f=$1 name out status
  name=$(grep -m1 '^# TEST:\|^-- TEST:' "$f" | sed 's/^\(#\|--\) TEST: //')
  if [[ $f == *.sh ]]; then out=$(bash "$f" 2>&1); else out=$(psql_q -d "$DB" -f "$f" 2>&1); fi
  status=$?
  if [ $status = 0 ]; then
    pass=$((pass + 1)); echo "PASS $(basename "$f"): $name"
  else
    fail=$((fail + 1)); echo "FAIL $(basename "$f"): $name"
    echo "$out" | grep -E "ERROR:|FATAL:" | head -3 | sed 's/^/       /'
  fi
}

# Tests run in file-name order and share one database (later tests build on
# earlier ones), each in its own psql session.
while IFS= read -r f; do run_test "$f"; done < <(ls tests/*.sql tests/*.sh | sort)

# PART 5 is commented out in the migration (it runs only after the new
# frontend is live). Apply those lines here to prove booking still works without
# the direct-insert policies.
part5=$(sed -n '/^-- PART 5\./,$p' "$MIGRATION" | sed -n 's/^-- \(drop policy .*\)$/\1/p')
echo "$part5" | psql_q -d "$DB" >/dev/null 2>&1 && echo "Applied PART 5 ($(echo "$part5" | grep -c 'drop policy') statements) to the local mock"
for f in tests/after-part5/*.sql; do
  name=$(grep -m1 '^-- TEST:' "$f" | sed 's/^-- TEST: //')
  if out=$(psql_q -d "$DB" -f "$f" 2>&1); then
    pass=$((pass + 1)); echo "PASS after-part5/$(basename "$f"): $name"
  else
    fail=$((fail + 1)); echo "FAIL after-part5/$(basename "$f"): $name"
    echo "$out" | grep -E "ERROR:|FATAL:" | head -3 | sed 's/^/       /'
  fi
done

echo
echo "SQL tests: $pass passed, $fail failed"
[ $fail = 0 ]
