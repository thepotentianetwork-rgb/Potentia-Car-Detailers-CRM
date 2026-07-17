-- ============================================================================
-- Potentia Multi-Tenant Migration
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query). It is written to be safe to re-run (idempotent) if something fails
-- partway through and you need to run it again.
--
-- What this does:
--   1. Creates `tenants`, `leads`, `lead_tasks` tables
--   2. Adds `tenant_id` to profiles/bookings/vehicles/services/expenses (nullable)
--   3. Backfills a `tenants` row for Apex Auto Detailing and assigns all
--      existing data (profiles, bookings, vehicles, services, expenses) to it,
--      renaming the existing 'admin' role to 'business_owner'
--   4. NOW locks it down: widens profiles.role to potentia_admin /
--      business_owner / staff / customer, requires a tenant unless
--      potentia_admin, makes tenant_id NOT NULL on the tenant-scoped tables
--   5. Helper functions (is_potentia_admin, current_tenant_id, is_tenant_staff)
--   6. Rewrites the public_availability view to be tenant-aware
--   7. Rewrites the new-user signup trigger so self-signup can only ever
--      create `customer` role accounts (never business_owner/potentia_admin)
--      and resolves tenant_id from a tenant_slug passed at signup
--   8. Rewrites every RLS policy on every affected table for tenant isolation
--   9. Scopes the receipts Storage bucket by tenant folder
--
-- NOTE: if you already uploaded any real receipt photos before this
-- migration, their storage paths won't match the new tenant-folder policy
-- and the app will no longer be able to view/delete them (the files are
-- NOT deleted, just inaccessible via the app - recoverable from the
-- Supabase Storage browser if that ever matters).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Core new tables
-- ----------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  industry text not null default 'auto_detailing',
  status text not null default 'active' check (status in ('active','trial','suspended')),
  tagline text,
  business_hours jsonb not null default '{"start":"9:00 AM","end":"5:00 PM"}',
  booking_granularity_min int not null default 30,
  mobile_travel_buffer_min int not null default 30,
  expense_categories text[] not null default array['Gas','Equipment','Water & Electricity','Phone','Chemicals','Vehicle Maintenance','Equipment Maintenance','Other'],
  payment_methods text[] not null default array['Cash','Card','Venmo','Zelle','Other'],
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  industry text,
  status text not null default 'new' check (status in ('new','contacted','quoted','won','lost')),
  deal_value numeric,
  notes text,
  tags text[],
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  title text not null,
  due_date timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2. tenant_id columns everywhere (nullable for now - constraints and NOT
--    NULL come later, AFTER the backfill below gives every row a value).
-- ----------------------------------------------------------------------------

alter table public.profiles add column if not exists tenant_id uuid references public.tenants(id);
alter table public.bookings add column if not exists tenant_id uuid references public.tenants(id);
alter table public.vehicles add column if not exists tenant_id uuid references public.tenants(id);
alter table public.services add column if not exists tenant_id uuid references public.tenants(id);
alter table public.expenses add column if not exists tenant_id uuid references public.tenants(id);


-- ----------------------------------------------------------------------------
-- 3. Backfill: Apex Auto Detailing becomes tenant #1, all existing data
--    assigned to it. Existing 'admin' role becomes 'business_owner'. This
--    MUST happen before the constraints in step 4, which validate every
--    existing row immediately on creation.
-- ----------------------------------------------------------------------------

insert into public.tenants (name, slug, industry, tagline, business_hours, booking_granularity_min, mobile_travel_buffer_min, expense_categories, payment_methods)
select
  'Apex Auto Detailing', 'apex-detailing', 'auto_detailing',
  E'Don\'t Stress, Enjoy the Best!',
  '{"start":"9:00 AM","end":"5:00 PM"}'::jsonb,
  30, 30,
  array['Gas','Equipment','Water & Electricity','Phone','Chemicals','Vehicle Maintenance','Equipment Maintenance','Other'],
  array['Cash','Card','Venmo','Zelle','Other']
where not exists (select 1 from public.tenants where slug = 'apex-detailing');

update public.profiles
  set tenant_id = (select id from public.tenants where slug = 'apex-detailing')
  where tenant_id is null and role <> 'potentia_admin';

update public.profiles
  set role = 'business_owner'
  where role = 'admin';

update public.bookings set tenant_id = (select id from public.tenants where slug = 'apex-detailing') where tenant_id is null;
update public.vehicles set tenant_id = (select id from public.tenants where slug = 'apex-detailing') where tenant_id is null;
update public.services set tenant_id = (select id from public.tenants where slug = 'apex-detailing') where tenant_id is null;
update public.expenses set tenant_id = (select id from public.tenants where slug = 'apex-detailing') where tenant_id is null;


-- ----------------------------------------------------------------------------
-- 4. Now that every row has a consistent value, lock it down: widen the role
--    check, require a tenant unless potentia_admin, and make tenant_id
--    mandatory on the tenant-scoped tables.
-- ----------------------------------------------------------------------------

-- Drop any existing CHECK constraint on profiles.role (name unknown/varies)
-- before adding the widened one.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('potentia_admin','business_owner','staff','customer'));

-- A profile must belong to a tenant unless it's a platform-level admin.
alter table public.profiles drop constraint if exists profiles_tenant_required;
alter table public.profiles
  add constraint profiles_tenant_required
  check (role = 'potentia_admin' or tenant_id is not null);

alter table public.bookings alter column tenant_id set not null;
alter table public.vehicles alter column tenant_id set not null;
alter table public.services alter column tenant_id set not null;
alter table public.expenses alter column tenant_id set not null;


-- ----------------------------------------------------------------------------
-- 5. Helper functions
-- ----------------------------------------------------------------------------

create or replace function public.is_potentia_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'potentia_admin')
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_tenant_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('business_owner','staff'))
$$;


-- ----------------------------------------------------------------------------
-- 6. public_availability view, made tenant-aware
-- ----------------------------------------------------------------------------

create or replace view public.public_availability as
select booking_date, start_time, duration_min, type, status, tenant_id
from public.bookings
where status not in ('declined', 'cancelled');


-- ----------------------------------------------------------------------------
-- 7. Signup trigger: self-signup can only ever create 'customer' accounts.
--    business_owner/staff/potentia_admin accounts are provisioned manually
--    by you via direct SQL, never through public signup.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  resolved_tenant_id uuid;
begin
  select id into resolved_tenant_id
  from public.tenants
  where slug = new.raw_user_meta_data->>'tenant_slug';

  insert into public.profiles (id, full_name, role, tenant_id)
  values (new.id, new.raw_user_meta_data->>'full_name', 'customer', resolved_tenant_id);

  return new;
end;
$$;

-- Re-point the existing profile-creation trigger at the function above.
-- Only touches a trigger whose function body references "profiles" - this
-- deliberately does NOT touch any other trigger Supabase may have on
-- auth.users (email confirmations, webhooks, etc).
do $$
declare
  trg record;
  fn_source text;
  found boolean := false;
begin
  for trg in
    select t.tgname, t.tgfoid
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
  loop
    select prosrc into fn_source from pg_proc where oid = trg.tgfoid;
    if fn_source ilike '%profiles%' then
      execute format('drop trigger %I on auth.users', trg.tgname);
      found := true;
    end if;
  end loop;

  if not found then
    raise notice 'No existing profile-creation trigger found on auth.users - creating a fresh one.';
  end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 8. RLS: drop every existing policy on each affected table, then rebuild
--    a clean, consistent, tenant-aware set.
-- ----------------------------------------------------------------------------

do $$
declare
  pol record;
  tbl text;
begin
  foreach tbl in array array['tenants','profiles','services','bookings','vehicles','expenses','leads','lead_tasks']
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;
  end loop;
end $$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.vehicles enable row level security;
alter table public.expenses enable row level security;
alter table public.leads enable row level security;
alter table public.lead_tasks enable row level security;

-- tenants: public info (name/tagline/hours) needs to be readable by anyone,
-- logged in or not, so a tenant's public booking homepage can render.
create policy "tenants are publicly readable" on public.tenants
  for select using (true);

create policy "potentia_admin manages tenants" on public.tenants
  for all using (is_potentia_admin()) with check (is_potentia_admin());

-- profiles
create policy "users see own profile" on public.profiles
  for select using (id = auth.uid());

create policy "staff see profiles in their tenant" on public.profiles
  for select using (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin sees all profiles" on public.profiles
  for select using (is_potentia_admin());

create policy "potentia_admin manages profiles" on public.profiles
  for update using (is_potentia_admin()) with check (is_potentia_admin());

-- services: publicly readable (homepage), writable by tenant staff only
create policy "services are publicly readable" on public.services
  for select using (true);

create policy "staff manage services in their tenant" on public.services
  for all using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin manages all services" on public.services
  for all using (is_potentia_admin()) with check (is_potentia_admin());

-- bookings
create policy "customers see own bookings" on public.bookings
  for select using (profile_id = auth.uid());

create policy "customers create own bookings" on public.bookings
  for insert with check (
    profile_id = auth.uid()
    and tenant_id = current_tenant_id()
  );

create policy "staff see bookings in their tenant" on public.bookings
  for select using (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "staff manage bookings in their tenant" on public.bookings
  for update using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin manages all bookings" on public.bookings
  for all using (is_potentia_admin()) with check (is_potentia_admin());

-- vehicles
create policy "customers see own vehicles" on public.vehicles
  for select using (
    profile_id in (select id from public.profiles where id = auth.uid())
  );

create policy "customers create own vehicles" on public.vehicles
  for insert with check (
    profile_id = auth.uid()
    and tenant_id = current_tenant_id()
  );

create policy "staff see vehicles in their tenant" on public.vehicles
  for select using (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "staff manage vehicles in their tenant" on public.vehicles
  for update using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin manages all vehicles" on public.vehicles
  for all using (is_potentia_admin()) with check (is_potentia_admin());

-- expenses: staff/owner only, no customer access at all
create policy "staff manage expenses in their tenant" on public.expenses
  for all using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin manages all expenses" on public.expenses
  for all using (is_potentia_admin()) with check (is_potentia_admin());

-- leads / lead_tasks: potentia_admin only, no tenant scoping (platform-level)
create policy "potentia_admin manages leads" on public.leads
  for all using (is_potentia_admin()) with check (is_potentia_admin());

create policy "potentia_admin manages lead_tasks" on public.lead_tasks
  for all using (is_potentia_admin()) with check (is_potentia_admin());


-- ----------------------------------------------------------------------------
-- 9. Storage: scope the receipts bucket by tenant folder
--    (upload paths become "<tenant_id>/<uuid>.<ext>")
-- ----------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('Admins can upload receipts','Admins can view receipts','Admins can delete receipts')
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "Tenant staff can upload receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (is_tenant_staff() and (storage.foldername(name))[1] = current_tenant_id()::text)
  );

create policy "Tenant staff can view receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      (is_tenant_staff() and (storage.foldername(name))[1] = current_tenant_id()::text)
      or is_potentia_admin()
    )
  );

create policy "Tenant staff can delete receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (is_tenant_staff() and (storage.foldername(name))[1] = current_tenant_id()::text)
  );
