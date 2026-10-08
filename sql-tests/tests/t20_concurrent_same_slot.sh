#!/usr/bin/env bash
# TEST: two people requesting the same slot at the same moment get exactly one booking (per-day advisory lock)
# Session A books and holds its transaction open; session B asks for the same
# slot meanwhile. B must wait for A, then be told the slot was taken.
set -euo pipefail
q() { $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
q -c "insert into public.tenants (id, name, slug) values ('33333333-3333-3333-3333-333333333333', 'Shop C', 'shop-c')" \
  -c "insert into public.services (id, name, price_cents, duration_min, tenant_id) values ('cccccccc-1111-0000-0000-000000000001', 'C Wash', 4000, 60, '33333333-3333-3333-3333-333333333333')"
day=$(q -At -c "select ((now() at time zone 'America/Denver')::date + 4)::text")
book() { echo "select sqltest.as_anon(); select booking_id from public.request_booking('shop-c','cccccccc-1111-0000-0000-000000000001','$day','10:00','dropoff','Car',null,null,'Racer $1','555444000$1',null,null);"; }
tmp=$(mktemp -d)
( q -c "begin" -c "$(book 1)" -c "select pg_sleep(2)" -c "commit" ) >"$tmp/a" 2>&1 &
a=$!
sleep 0.7
set +e
q -c "$(book 2)" >"$tmp/b" 2>&1
b_status=$?
set -e
wait $a
n=$(q -At -c "select count(*) from public.bookings where tenant_id = '33333333-3333-3333-3333-333333333333' and booking_date = '$day' and start_time = '10:00'")
if [ "$n" != "1" ] || [ "$b_status" = "0" ] || ! grep -q "just taken" "$tmp/b"; then
  echo "ERROR: expected exactly 1 booking and session B told 'just taken'; got $n bookings, B exit $b_status"
  sed 's/^/  B: /' "$tmp/b"; sed 's/^/  A: /' "$tmp/a"
  rm -rf "$tmp"; exit 1
fi
rm -rf "$tmp"
