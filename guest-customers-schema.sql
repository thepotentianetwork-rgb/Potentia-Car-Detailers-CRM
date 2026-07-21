-- Lets tenant staff/owners book a service on behalf of a customer who calls or
-- texts in, without that customer ever needing a login. Run this once in the
-- Supabase SQL Editor.

-- 1. profiles.id currently must reference an auth.users row (it's set from
--    auth.uid() at signup). Drop that FK so staff can insert a "guest" profile
--    with a freshly generated id that has no corresponding auth user at all —
--    that's what makes the customer login-less.
do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.profiles alter column id set default gen_random_uuid();

-- 2. Staff can create guest customer profiles in their own tenant. The role
--    is pinned to 'customer' in the check, so staff can never use this path
--    to grant themselves or anyone else elevated access.
create policy "staff create guest customers in their tenant" on public.profiles
  for insert with check (
    is_tenant_staff()
    and tenant_id = current_tenant_id()
    and role = 'customer'
  );

-- 3. Staff can add a vehicle for any customer (guest or real) in their tenant.
create policy "staff create vehicles in their tenant" on public.vehicles
  for insert with check (is_tenant_staff() and tenant_id = current_tenant_id());

-- 4. Staff can create a booking directly (phone/text booking), not just
--    update existing ones.
create policy "staff create bookings in their tenant" on public.bookings
  for insert with check (is_tenant_staff() and tenant_id = current_tenant_id());

-- 5. Track which staff member/detailer a booking is assigned to.
alter table public.bookings
  add column if not exists staff_id uuid references public.profiles(id);
