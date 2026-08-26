-- Q-Bay Real Estate CRM — storage buckets + policies.
-- Public buckets: media meant to render on the future public website.
-- Private buckets: internal documents/imports, gated by has_permission('uploads', ...).
-- submission-media is special: public website users upload under their own
-- auth.uid() folder; staff with submissions.view can read everything.

insert into storage.buckets (id, name, public) values
  ('lead-imports', 'lead-imports', false),
  ('conversation-files', 'conversation-files', false),
  ('property-documents', 'property-documents', false),
  ('property-media', 'property-media', true),
  ('call-recordings', 'call-recordings', false),
  ('general-documents', 'general-documents', false),
  ('development-media', 'development-media', true),
  ('development-documents', 'development-documents', false),
  ('owner-documents', 'owner-documents', false),
  ('blog-images', 'blog-images', true),
  ('submission-media', 'submission-media', false)
on conflict (id) do nothing;

-- Private, staff-only buckets gated by the uploads module.
do $$
declare
  b text;
begin
  for b in select unnest(array[
    'lead-imports', 'conversation-files', 'property-documents',
    'call-recordings', 'general-documents', 'development-documents', 'owner-documents'
  ])
  loop
    execute format('drop policy if exists %I on storage.objects', b || '_select');
    execute format(
      $p$create policy %I on storage.objects for select to authenticated
        using (bucket_id = %L and public.has_permission('uploads', 'view'))$p$,
      b || '_select', b
    );
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format(
      $p$create policy %I on storage.objects for insert to authenticated
        with check (bucket_id = %L and public.has_permission('uploads', 'upload'))$p$,
      b || '_insert', b
    );
    execute format('drop policy if exists %I on storage.objects', b || '_delete');
    execute format(
      $p$create policy %I on storage.objects for delete to authenticated
        using (bucket_id = %L and public.has_permission('uploads', 'delete'))$p$,
      b || '_delete', b
    );
  end loop;
end $$;

-- Public-read media buckets: anyone can read (future website), only staff with
-- uploads.upload/delete can write.
do $$
declare
  b text;
begin
  for b in select unnest(array['property-media', 'development-media', 'blog-images'])
  loop
    execute format('drop policy if exists %I on storage.objects', b || '_select_public');
    execute format(
      $p$create policy %I on storage.objects for select to anon, authenticated using (bucket_id = %L)$p$,
      b || '_select_public', b
    );
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format(
      $p$create policy %I on storage.objects for insert to authenticated
        with check (bucket_id = %L and public.has_permission('uploads', 'upload'))$p$,
      b || '_insert', b
    );
    execute format('drop policy if exists %I on storage.objects', b || '_delete');
    execute format(
      $p$create policy %I on storage.objects for delete to authenticated
        using (bucket_id = %L and public.has_permission('uploads', 'delete'))$p$,
      b || '_delete', b
    );
  end loop;
end $$;

-- submission-media: public website users write under their own auth.uid()
-- folder prefix; staff with submissions.view can read all; owners can read
-- their own regardless of module permission.
create policy submission_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'submission-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy submission_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'submission-media' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.has_permission('submissions', 'view')
  ));
create policy submission_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'submission-media' and (storage.foldername(name))[1] = auth.uid()::text);
