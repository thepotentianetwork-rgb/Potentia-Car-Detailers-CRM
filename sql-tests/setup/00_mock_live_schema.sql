-- LOCAL TEST HARNESS ONLY. Recreates the shape of the live Supabase schema
-- (as read from the catalog on 2026-10-08) in a throwaway local Postgres 17,
-- so the proposed migration can be exercised without touching production.
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
create extension if not exists pgcrypto;

create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

create table public.tenants (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  industry text not null default 'auto_detailing',
  status text not null default 'active' check (status in ('active','trial','suspended')),
  tagline text, business_hours jsonb not null default '{"start":"9:00 AM","end":"5:00 PM"}',
  booking_granularity_min int not null default 30, mobile_travel_buffer_min int not null default 30,
  expense_categories text[] not null default '{}', payment_methods text[] not null default '{}',
  created_at timestamptz not null default now());
create table public.profiles (
  id uuid primary key default gen_random_uuid(), full_name text, phone text,
  role text not null default 'customer' check (role in ('potentia_admin','business_owner','staff','customer')),
  created_at timestamptz not null default now(), tenant_id uuid references public.tenants(id),
  constraint profiles_tenant_required check (role = 'potentia_admin' or tenant_id is not null));
create table public.services (
  id uuid primary key default gen_random_uuid(), name text not null, price_cents int not null,
  duration_min int not null, is_premium boolean not null default false, active boolean not null default true,
  sort_order int not null default 0, tenant_id uuid not null references public.tenants(id));
create table public.vehicles (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null, is_primary boolean not null default true, created_at timestamptz not null default now(),
  notes text, tenant_id uuid not null references public.tenants(id));
create table public.bookings (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id), vehicle_id uuid references public.vehicles(id),
  booking_date date not null, start_time time not null, duration_min int not null,
  type text not null check (type in ('dropoff','mobile')), mobile_address text,
  status text not null default 'pending' check (status in ('pending','approved','declined','completed','cancelled')),
  price_cents int not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  paid boolean not null default false, payment_method text, tenant_id uuid not null references public.tenants(id),
  staff_id uuid references public.profiles(id));
create index bookings_date_idx on public.bookings (booking_date);
create index bookings_profile_idx on public.bookings (profile_id);

create function public.current_tenant_id() returns uuid language sql stable security definer set search_path = public
  as $$ select tenant_id from public.profiles where id = auth.uid() $$;
create function public.is_tenant_staff() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('business_owner','staff')) $$;
create function public.is_potentia_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'potentia_admin') $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare resolved_tenant_id uuid;
begin
  select id into resolved_tenant_id from public.tenants where slug = new.raw_user_meta_data->>'tenant_slug';
  insert into public.profiles (id, full_name, role, tenant_id)
  values (new.id, new.raw_user_meta_data->>'full_name', 'customer', resolved_tenant_id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create view public.public_availability as
  select booking_date, start_time, duration_min, type, status, tenant_id from public.bookings
  where status not in ('declined','cancelled');

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.vehicles enable row level security;

create policy "tenants are publicly readable" on public.tenants for select using (true);
create policy "users see own profile" on public.profiles for select using (id = auth.uid());
create policy "staff see profiles in their tenant" on public.profiles for select using (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "staff create guest customers in their tenant" on public.profiles for insert
  with check (is_tenant_staff() and tenant_id = current_tenant_id() and role = 'customer');
create policy "services are publicly readable" on public.services for select using (true);
create policy "customers see own bookings" on public.bookings for select using (profile_id = auth.uid());
create policy "customers create own bookings" on public.bookings for insert with check (profile_id = auth.uid() and tenant_id = current_tenant_id());
create policy "staff see bookings in their tenant" on public.bookings for select using (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "staff create bookings in their tenant" on public.bookings for insert with check (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "staff manage bookings in their tenant" on public.bookings for update using (is_tenant_staff() and tenant_id = current_tenant_id()) with check (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "customers see own vehicles" on public.vehicles for select using (profile_id in (select id from public.profiles where id = auth.uid()));
create policy "customers create own vehicles" on public.vehicles for insert with check (profile_id = auth.uid() and tenant_id = current_tenant_id());
create policy "staff see vehicles in their tenant" on public.vehicles for select using (is_tenant_staff() and tenant_id = current_tenant_id());
create policy "staff create vehicles in their tenant" on public.vehicles for insert with check (is_tenant_staff() and tenant_id = current_tenant_id());

-- Supabase's default: anon/authenticated get full table privileges; RLS does the gating.
grant all on all tables in schema public to anon, authenticated;
