#!/usr/bin/env bash
# TEST: two staff moving different bookings into the same slot at once get one move (per-day advisory lock in reschedule_booking)
set -euo pipefail
q() { $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
day=$(q -At -c "select ((now() at time zone 'America/Denver')::date + 10)::text")
mk() { echo "select booking_id from public.create_manual_booking('44444444-4444-4444-4444-444444444444','dddd0000-0000-0000-0000-000000000001','$day','$1','dropoff','Car',null,'Racer $2');"; }
x=$(q -At -c "select sqltest.as_user('dddddddd-0000-0000-0000-000000000004')" -c "$(mk 09:00 X)" | tail -1)
y=$(q -At -c "select sqltest.as_user('dddddddd-0000-0000-0000-000000000004')" -c "$(mk 14:00 Y)" | tail -1)
mv() { echo "select sqltest.as_user('dddddddd-0000-0000-0000-000000000004'); select * from public.reschedule_booking('$1','$day','11:00');"; }
tmp=$(mktemp -d)
( q -c "begin" -c "$(mv "$x")" -c "select pg_sleep(2)" -c "commit" ) >"$tmp/a" 2>&1 &
a=$!
sleep 0.7
set +e
q -c "$(mv "$y")" >"$tmp/b" 2>&1
b_status=$?
set -e
wait $a
n=$(q -At -c "select count(*) from public.bookings where tenant_id = '44444444-4444-4444-4444-444444444444' and booking_date = '$day' and start_time = '11:00'")
if [ "$n" != "1" ] || [ "$b_status" = "0" ] || ! grep -q "overlap another booking" "$tmp/b"; then
  echo "ERROR: expected exactly 1 booking at 11:00 and session B told it overlaps; got $n, B exit $b_status"
  sed 's/^/  B: /' "$tmp/b"; sed 's/^/  A: /' "$tmp/a"
  rm -rf "$tmp"; exit 1
fi
rm -rf "$tmp"
