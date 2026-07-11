-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Adds a free-text notes field per vehicle: paint condition, gate codes for
-- mobile jobs, allergies to certain chemicals, upsell reminders, etc.
-- Safe to run once; IF NOT EXISTS makes it a no-op if already applied.

alter table public.vehicles
  add column if not exists notes text;

-- The existing RLS policies on vehicles let admins SELECT all rows but not
-- UPDATE them (only the owning customer could update their own vehicle row).
-- Without this, admin note-saving silently affects 0 rows instead of erroring.
drop policy if exists "Admins can update vehicles" on public.vehicles;
create policy "Admins can update vehicles"
  on public.vehicles
  for update
  using (is_admin())
  with check (is_admin());
