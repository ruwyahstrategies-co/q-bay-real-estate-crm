-- Property Management had nowhere to put tenant identity documents or signed
-- tenancy contracts; they were reaching for the property-documents bucket,
-- which conflates a unit's paperwork with the person renting it. Give tenant
-- and tenancy documents their own private bucket, RLS'd the same way as
-- every other private document bucket (uploads.view / uploads.upload / uploads.delete).

insert into storage.buckets (id, name, public)
values ('tenant-documents', 'tenant-documents', false)
on conflict (id) do nothing;

drop policy if exists "tenant-documents_select" on storage.objects;
create policy "tenant-documents_select" on storage.objects
  for select using (bucket_id = 'tenant-documents' and public.has_permission('uploads', 'view'));

drop policy if exists "tenant-documents_insert" on storage.objects;
create policy "tenant-documents_insert" on storage.objects
  for insert with check (bucket_id = 'tenant-documents' and public.has_permission('uploads', 'upload'));

drop policy if exists "tenant-documents_delete" on storage.objects;
create policy "tenant-documents_delete" on storage.objects
  for delete using (bucket_id = 'tenant-documents' and public.has_permission('uploads', 'delete'));
