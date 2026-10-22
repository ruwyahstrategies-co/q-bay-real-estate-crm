-- Follow-up to 20261022001400: adding a file must not use the "uploader can always see it" shortcut.
-- Found by the isolation test: with the shortcut in the insert check, a sales agent could attach a file to
-- another agent's lead or owner simply by naming themselves as the uploader. Adding a file now checks only
-- the link rules; viewing and deleting still let the uploader see their own file.

create or replace function public.can_access_upload_links(
  _lead_id uuid,
  _offer_id uuid,
  _interaction_id uuid,
  _owner_id uuid,
  _tenant_id uuid,
  _submission_id uuid,
  _transaction_id uuid,
  _lease_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is not null
    and (_lead_id is null or public.can_access_lead(_lead_id))
    and (_offer_id is null or exists (select 1 from public.offers o where o.id = _offer_id))
    and (_interaction_id is null or exists (select 1 from public.interactions i where i.id = _interaction_id))
    and (_owner_id is null or public.can_view_owner_phone(_owner_id))
    and (_tenant_id is null or public.can_view_tenant_id(_tenant_id))
    and (_submission_id is null or public.can_view_submission_id(_submission_id))
    and (_transaction_id is null or public.has_permission('accounting', 'view'))
    and (_lease_id is null or exists (select 1 from public.property_leases l where l.id = _lease_id));
$$;

grant execute on function public.can_access_upload_links(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.can_access_upload_links(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;

create or replace function public.can_access_upload(
  _uploaded_by uuid,
  _lead_id uuid,
  _offer_id uuid,
  _interaction_id uuid,
  _owner_id uuid,
  _tenant_id uuid,
  _submission_id uuid,
  _transaction_id uuid,
  _lease_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is not null and (
    _uploaded_by = auth.uid()
    or public.can_access_upload_links(_lead_id, _offer_id, _interaction_id, _owner_id, _tenant_id, _submission_id, _transaction_id, _lease_id)
  );
$$;

alter policy uploads_insert on public.uploads
  with check (
    public.has_permission('uploads', 'upload')
    and public.can_access_upload_links(
      lead_id, offer_id, interaction_id, owner_id, tenant_id,
      property_submission_id, transaction_id, property_lease_id
    )
  );
