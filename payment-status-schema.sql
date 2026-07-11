-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Adds manual payment tracking to bookings: whether it's been paid, and how
-- (cash, card, Venmo, etc). No payment processor involved - this is just a
-- record for your own bookkeeping.

alter table public.bookings
  add column if not exists paid boolean not null default false;

alter table public.bookings
  add column if not exists payment_method text;
