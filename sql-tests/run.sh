#!/usr/bin/env bash
# SQL tests for the booking migrations, run against a THROWAWAY local
# Postgres (never the live Supabase database). See README.md.
#
#   ./run.sh                  live-state mock -> apply multiservice migration -> run tests
#   ./run.sh --no-migration   same, without multiservice-migration.sql (shows its tests failing)
#
# Env: SQLTEST_PSQL  psql command   (default: "sudo -u postgres psql")
#      SQLTEST_DB    database name  (default: crm_guest_test; dropped and recreated)
set -uo pipefail
cd "$(dirname "$0")"

GUEST=../guest-booking-migration.sql
ADDONS=../services-addons-migration.sql
MIGRATION=../multiservice-migration.sql
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

# Live state (2026-10-12): guest-booking PARTS 0-4 plus PART 5 (its two
# commented-out drop policy lines) are applied in production.
psql_q -d "$DB" -f "$GUEST" >/dev/null 2>&1 || { echo "guest-booking migration failed to apply" >&2; exit 2; }
part5=$(sed -n '/^-- PART 5\./,$p' "$GUEST" | sed -n 's/^-- \(drop policy .*\)$/\1/p')
echo "$part5" | psql_q -d "$DB" >/dev/null 2>&1 || { echo "guest-booking PART 5 failed" >&2; exit 2; }
# services-addons-migration.sql (sections 1-6) is live too.
psql_q -d "$DB" -f "$ADDONS" >/dev/null 2>&1 || { echo "services-addons migration failed to apply" >&2; exit 2; }
# History that exists before the multiservice migration (a past booking
# with a booking_addons row), so tests can prove the migration leaves it alone.
psql_q -d "$DB" -f setup/03_pre_multiservice_history.sql >/dev/null 2>&1 || { echo "history seed failed" >&2; exit 2; }
echo "Mock = live state: $GUEST PARTS 0-5 + $ADDONS sections 1-6"

if [ $with_migration = 1 ]; then
  psql_q -d "$DB" -f "$MIGRATION" >/dev/null 2>&1 || { echo "migration failed to apply:" >&2; psql_q -d "$DB" -f "$MIGRATION" 2>&1 | grep -i error >&2; exit 2; }
  echo "Applied $MIGRATION (sections 1-6)"
else
  echo "NOT applying $MIGRATION (--no-migration)"
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
# earlier ones), each in its own psql session. t* = guest booking, u* =
# services, add-ons, reschedule (both still hold after the multiservice
# migration: old calls keep working), v* = multi-service booking.
while IFS= read -r f; do run_test "$f"; done < <(ls tests/*.sql tests/*.sh | sort)

echo
echo "SQL tests: $pass passed, $fail failed"
[ $fail = 0 ]
