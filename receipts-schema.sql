-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Adds photo receipts for expenses: a private Storage bucket plus RLS so
-- only admins can upload/view/delete files in it, and a column on expenses
-- pointing at the stored file.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "Admins can upload receipts" on storage.objects;
create policy "Admins can upload receipts"
  on storage.objects
  for insert
  with check (bucket_id = 'receipts' and is_admin());

drop policy if exists "Admins can view receipts" on storage.objects;
create policy "Admins can view receipts"
  on storage.objects
  for select
  using (bucket_id = 'receipts' and is_admin());

drop policy if exists "Admins can delete receipts" on storage.objects;
create policy "Admins can delete receipts"
  on storage.objects
  for delete
  using (bucket_id = 'receipts' and is_admin());

alter table public.expenses
  add column if not exists receipt_path text;
