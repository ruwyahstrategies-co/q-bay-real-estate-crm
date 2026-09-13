insert into storage.buckets (id, name, public)
values ('offer-attachments', 'offer-attachments', false)
on conflict (id) do nothing;

drop policy if exists "offer-attachments_select" on storage.objects;
create policy "offer-attachments_select" on storage.objects
  for select using (bucket_id = 'offer-attachments' and public.has_permission('offers', 'view'));

drop policy if exists "offer-attachments_insert" on storage.objects;
create policy "offer-attachments_insert" on storage.objects
  for insert with check (bucket_id = 'offer-attachments' and (public.has_permission('offers', 'create') or public.has_permission('offers', 'edit')));

drop policy if exists "offer-attachments_delete" on storage.objects;
create policy "offer-attachments_delete" on storage.objects
  for delete using (bucket_id = 'offer-attachments' and public.has_permission('offers', 'delete'));
