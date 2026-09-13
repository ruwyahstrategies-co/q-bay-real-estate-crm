-- Permanent property delete is reserved for Super Administrator. The generic
-- "delete" action (kept for any future soft/administrative use) is no longer
-- sufficient on its own; only "hard_delete" gates the actual DELETE.
drop policy if exists properties_delete on public.properties;
create policy properties_delete on public.properties for delete to authenticated
  using (public.has_permission('properties','hard_delete'));
