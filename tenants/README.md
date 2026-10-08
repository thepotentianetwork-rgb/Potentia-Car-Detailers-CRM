# Setting up a detailer tenant

A tenant (one detailing business) is made of three parts:

1. **Database rows** (Supabase): one `tenants` row (name, slug, tagline,
   `business_hours` `{start,end}`, `booking_granularity_min`,
   `mobile_travel_buffer_min`, `expense_categories`, `payment_methods`,
   `timezone`, `status`) and its `services` rows (name, `price_cents`,
   `duration_min`, `is_premium`, `active`, `sort_order`). Write these as
   `tenants/<slug>-seed.sql`; it is applied by hand in the Supabase SQL editor
   after review.
2. **Branding** (code): `src/tenants/<slug>.js`, registered in
   `src/tenants/branding.js`. Logo, hero video, fonts, colors, contact info,
   closed weekdays, per-service copy ("From" prices, duration ranges,
   what's included). Assets go in `public/tenants/<slug>/`. Tenants without
   an entry get the default Potentia look.
3. **Owner login**: invite the owner's email in Supabase Auth, then set their
   `profiles` row to `role = 'business_owner'` and the tenant's `tenant_id`
   (see the end of a seed file). Public signup only ever makes customers.

URLs: `/crm/<slug>/portal` (customers book here), `/crm/<slug>` (owner
dashboard), `/login` (Potentia client login).
