-- ============================================================================
-- Tenant seed: Juan's Auto Detailing (Tremonton, UT)
-- Target: Supabase project tzopofqahgenotfxkyzf ("Auto Detailing Portal").
--
-- STATUS: NOT APPLIED. Prepared 2026-10-08 for Nando's review. Do not run it
-- against production until Nando approves it and the TODOs below are settled.
--
-- Prereqs (both checked live, read-only, on 2026-10-08):
--   * multi-tenant-migration.sql: tenants table, tenant_id columns, RLS.
--   * guest-booking-migration.sql PARTS 0-5: tenants.timezone,
--     request_booking(). (Supabase migration history shows parts 1-5 applied
--     2026-10-08, even though that file's header still says "not applied".)
--
-- Safe to re-run: the tenant and each service are inserted only if missing,
-- and nothing is updated or deleted. Wrapped in one transaction.
--
-- Source of truth: juansautodetailing.com (identical to repo
-- Juans-Auto-Detailing main @ 924a70e): services.html, book.html,
-- contact.html, about.html. Logo, colors, fonts and contact details are not
-- database fields; they live in src/tenants/juans-auto-detailing.js.
--
-- Portal after this runs:  /crm/juans-auto-detailing/portal  (customers)
--                          /crm/juans-auto-detailing         (owner sign-in)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tenant row
-- ----------------------------------------------------------------------------
insert into public.tenants (
  name, slug, industry, status, tagline, business_hours,
  booking_granularity_min, mobile_travel_buffer_min,
  expense_categories, payment_methods, timezone
)
select
  E'Juan\'s Auto Detailing',
  'juans-auto-detailing',
  'auto_detailing',
  -- TODO(Nando): 'trial' until Juan accepts the proposal ($250 onboarding +
  -- $50/mo). request_booking() accepts bookings for 'trial' and 'active'.
  'trial',
  -- Homepage hero and logo text.
  E'Don\'t Stress, Enjoy the Best!',
  -- TODO(Juan): open/close times. The site only says "Open Monday – Saturday".
  -- book.html offers start times 8:00 AM to 7:00 PM, so this uses 8 AM to 7 PM.
  -- The CRM needs each job to END by the closing time, so with 7 PM a 5-hour
  -- package can start no later than 2 PM. The tenant model has one
  -- open/close time for every day. Sundays are hidden in the portal by
  -- src/tenants/juans-auto-detailing.js (closedWeekdays), not by the database.
  '{"start":"8:00 AM","end":"7:00 PM"}'::jsonb,
  -- book.html offers hourly start times.
  60,
  -- TODO(Juan): travel buffer around mobile jobs. Not on the site, so this is
  -- the CRM default (30 min).
  30,
  -- CRM default expense categories.
  array['Gas','Equipment','Water & Electricity','Phone','Chemicals','Vehicle Maintenance','Equipment Maintenance','Other'],
  -- about.html: "Pay by cash or Venmo." 'Other' is the CRM's catch-all.
  array['Cash','Venmo','Other'],
  'America/Denver'
where not exists (select 1 from public.tenants where slug = 'juans-auto-detailing');


-- ----------------------------------------------------------------------------
-- 2. Services (prices from services.html / book.html)
--
-- price_cents: the listed price. For "From $X" services it is the starting
--   price. The site says "Pricing may vary based on vehicle size and location".
--   Staff can change a booking's service/price from the owner dashboard.
-- duration_min: how long the slot is blocked. The site gives ranges, so this
--   uses the upper end (4 – 5 hrs -> 300, 2 – 4 hrs -> 240, ~1.5 hrs -> 90,
--   ~5 hrs -> 300, ~30 min -> 30).
--   TODO(Juan): "Polish + Ceramic Coat" is "Half to Full Day" on the site;
--   480 (8 hours) is a placeholder. Confirm.
-- Names match book.html's service list. Copy and the "From" labels are in
-- src/tenants/juans-auto-detailing.js (serviceDetails), keyed by these names,
-- so if you rename a service here, rename it there too.
--
-- Not seeded on purpose:
--   * A separate "Ceramic Coating" (services.html, "Starting from $600"). It
--     is the same $600 offering as the "Polish + Ceramic Coat" add-on (the
--     ceramic section says it includes a full machine polish), and book.html
--     lists only "Polish + Ceramic Coat". TODO(Juan): confirm it's one service.
--
-- The CRM books ONE service per request. Juan's current form lets customers
-- tick several (e.g. a package + Pet Hair Removal) and has pet-hair/odor
-- checkboxes and a notes box. The CRM has none of those yet, so add-ons are
-- their own bookable services here and staff adjust the price after.
-- ----------------------------------------------------------------------------
insert into public.services (tenant_id, name, price_cents, duration_min, is_premium, active, sort_order)
select t.id, v.name, v.price_cents, v.duration_min, v.is_premium, true, v.sort_order
from public.tenants t
cross join (values
  -- Packages
  (E'Regular — Interior & Exterior',                 16500, 300, false,  1),
  (E'Medium — Interior, Shampoo & Exterior',         19500, 300, false,  2),
  (E'Super — Interior, Shampoo, Exterior & Engine',  24500, 300, false,  3),
  (E'Full Detail — Everything + Wax',                27500, 300, false,  4),
  -- Individual services ("From")
  ('Interior Only',                                  12500, 240, false,  5),
  ('Exterior Only',                                   7500,  90, false,  6),
  -- Add-ons
  ('Paint Polish',                                   40000, 300, false,  7),  -- "From $400"
  ('Polish + Ceramic Coat',                          60000, 480, true,   8),  -- "From $600", premium service
  ('Headlight Restoration',                           4500,  30, false,  9),
  ('Pet Hair Removal',                                3500,  30, false, 10),
  ('Odor Removal',                                    6500,  30, false, 11)
) as v(name, price_cents, duration_min, is_premium, sort_order)
where t.slug = 'juans-auto-detailing'
  and not exists (
    select 1 from public.services s where s.tenant_id = t.id and s.name = v.name
  );

commit;


-- ----------------------------------------------------------------------------
-- 3. Owner login for Juan: run separately, AFTER his auth user exists.
--
-- Accounts other than customers are never created by public signup (the
-- signup trigger only makes 'customer' profiles). To give Juan owner access:
--   a) Supabase dashboard -> Authentication -> Users -> "Invite user" (or
--      "Add user") with js07272001@gmail.com. The signup trigger creates a
--      'customer' profile with no tenant.
--   b) Then promote that profile to business_owner of this tenant:
--
-- update public.profiles p
--    set role = 'business_owner',
--        tenant_id = (select id from public.tenants where slug = 'juans-auto-detailing'),
--        full_name = coalesce(p.full_name, 'Juan')   -- TODO: Juan's full name
--  where p.id = (select u.id from auth.users u where lower(u.email) = 'js07272001@gmail.com');
--
--   c) Juan signs in at /login (or /crm/juans-auto-detailing) and lands on
--      the owner dashboard.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 4. Checks (read-only)
-- ----------------------------------------------------------------------------
-- select * from public.tenants where slug = 'juans-auto-detailing';
-- select name, price_cents / 100 as price, duration_min, is_premium, sort_order
--   from public.services
--  where tenant_id = (select id from public.tenants where slug = 'juans-auto-detailing')
--  order by sort_order;
