# SQL tests for `guest-booking-migration.sql`

These tests exercise the guest-booking migration (`request_booking()`, the
signup trigger, new columns, PART 0's view lockdown and PART 5) in a
**throwaway local Postgres**. They never touch the live Supabase database.

## What it does

`run.sh`:

1. Drops and recreates a local database (`crm_guest_test` by default).
2. Loads `setup/00_mock_live_schema.sql`, a copy of the shape of the live
   schema as read from the catalog on 2026-10-08 (tables, RLS policies,
   grants, signup trigger, `public_availability` view, `anon`/`authenticated`
   roles, a stub `auth.uid()`), then fake seed data (`setup/01_seed.sql`) and
   test helpers (`setup/02_helpers.sql`).
3. Applies `../guest-booking-migration.sql` (PARTS 0-4).
4. Runs every file in `tests/` in name order, each in its own psql session.
   Later tests build on data from earlier ones. A test passes when its file
   runs without an error; every check raises on failure.
5. Applies the commented-out PART 5 lines from the migration to the local
   mock and runs `tests/after-part5/`.

`./run.sh --no-migration` skips step 3, which shows the tests failing
without the migration. Only `t03` passes there; it guards behaviour that is
already true today: anon can't insert directly or read profiles.

## Running it

You need a local Postgres 15+ server (tested on 17) and a superuser, because
the mock creates roles and an `auth` schema.

```bash
sudo pg_ctlcluster 17 main start        # or however you start Postgres locally
./sql-tests/run.sh                      # default: sudo -u postgres psql
SQLTEST_PSQL="psql -U postgres -h localhost" ./sql-tests/run.sh
```

The script refuses to run if `PGHOST` points anywhere other than localhost or
a local socket, or if `DATABASE_URL`/`PGSERVICE` is set.

## Notes

- `t05`/`t06` skip their "already passed today" checks late in the
  business day (after about 10:30 PM), when "now + 30 minutes" would cross
  midnight.
- `t20_concurrent_same_slot.sh` opens two sessions at once to prove the
  per-day advisory lock stops double booking.
- If the live schema changes, update `setup/00_mock_live_schema.sql` to
  match. Read the catalog only; never write to the live database from here.
