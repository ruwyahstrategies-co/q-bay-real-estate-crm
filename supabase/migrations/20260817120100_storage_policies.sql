-- Storage policies for Q-Bay Real Estate CRM buckets.
--
-- Buckets already exist and are actively used by the app (created outside of
-- this migration, presumably via Lovable Cloud's storage UI):
--   lead-imports, conversation-files, property-documents, property-media,
--   call-recordings, general-documents
--
-- This migration switches object access from the current
-- public/anonymous-friendly model to "authenticated + has_permission()",
-- matching the RLS changes in 20260817120000_staff_auth_permissions_pipeline_stages.sql.
-- Requires that migration's public.has_permission() function to exist first.

do $$
declare
  b text;
begin
  for b in select unnest(array[
    'lead-imports', 'conversation-files', 'property-documents',
    'property-media', 'call-recordings', 'general-documents'
  ])
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      b || '_select'
    );
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
