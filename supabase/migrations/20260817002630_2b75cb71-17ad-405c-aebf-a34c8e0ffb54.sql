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

-- Lock the two permission helpers to signed-in callers only.
revoke execute on function public.current_team_permissions() from public, anon;
revoke execute on function public.has_permission(text, text) from public, anon;
grant execute on function public.current_team_permissions() to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;