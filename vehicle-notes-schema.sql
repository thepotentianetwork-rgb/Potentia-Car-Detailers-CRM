-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Adds a free-text notes field per vehicle: paint condition, gate codes for
-- mobile jobs, allergies to certain chemicals, upsell reminders, etc.
-- Safe to run once; IF NOT EXISTS makes it a no-op if already applied.

alter table public.vehicles
  add column if not exists notes text;
