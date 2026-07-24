-- Adds a vehicle inventory module for dealership tenants. Run this once in
-- the Supabase SQL Editor.
--
-- - inventory_vehicles: one row per car. Publicly readable (so a dealership's
--   own website can pull the live list straight from Supabase's REST API),
--   writable only by that tenant's staff/owner.
-- - vehicle-photos: a PUBLIC storage bucket (unlike the private receipts
--   bucket) since these photos need to show on a public listing page.
--   Uploads/deletes are still scoped to the uploading tenant's own folder.

create table if not exists public.inventory_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  vin text,
  year int,
  make text,
  model text,
  trim text,
  mileage int,
  price_cents int,
  exterior_color text,
  interior_color text,
  condition text,
  status text not null default 'for_sale' check (status in ('for_sale','pending','sold')),
  description text,
  features text[] not null default '{}',
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  sold_at timestamptz
);

alter table public.inventory_vehicles enable row level security;

create policy "inventory is publicly readable" on public.inventory_vehicles
  for select using (true);

create policy "staff manage inventory in their tenant" on public.inventory_vehicles
  for all using (is_tenant_staff() and tenant_id = current_tenant_id())
  with check (is_tenant_staff() and tenant_id = current_tenant_id());

create policy "potentia_admin manages all inventory" on public.inventory_vehicles
  for all using (is_potentia_admin()) with check (is_potentia_admin());

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

create policy "vehicle photos are publicly readable" on storage.objects
  for select using (bucket_id = 'vehicle-photos');

create policy "staff upload vehicle photos in their tenant" on storage.objects
  for insert with check (
    bucket_id = 'vehicle-photos'
    and is_tenant_staff()
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

create policy "staff delete vehicle photos in their tenant" on storage.objects
  for delete using (
    bucket_id = 'vehicle-photos'
    and is_tenant_staff()
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );
