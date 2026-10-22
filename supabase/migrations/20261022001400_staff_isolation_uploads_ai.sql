-- Staff isolation for files and AI lead analyses.
--
-- Before this, any staff member with the "view files" permission (every sales agent) could list every upload
-- record in the company and ask for a download link for any of them: other agents' lead attachments, signed
-- Booking and Reservation forms, owner identity documents. The same was true of AI analyses of other agents'
-- leads. Access now follows the record a file belongs to:
--
--   lead attachment        -> the person must be able to open that lead
--   offer and its forms    -> the person must be able to see that offer
--   conversation evidence  -> the person must be able to see that conversation (its lead)
--   owner document         -> the same rule as the owner's phone number
--   tenant, website submission and lease files -> their existing rules
--   transaction file       -> accounting access
--   property and development media, general documents -> unchanged (anyone allowed to view files)
--
-- The person who uploaded a file can always see it. The rule applies to viewing, adding and deleting files.
-- Super Administrators and Administrators keep full access through the same rules (they can open every lead,
-- owner and offer). The file download edge function applies the same rule (see r2-signed-read).

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
  -- Runs as the caller (not security definer) so the lookups below respect the caller's own row access.
  select auth.uid() is not null and (
    _uploaded_by = auth.uid()
    or (
      (_lead_id is null or public.can_access_lead(_lead_id))
      and (_offer_id is null or exists (select 1 from public.offers o where o.id = _offer_id))
      and (_interaction_id is null or exists (select 1 from public.interactions i where i.id = _interaction_id))
      and (_owner_id is null or public.can_view_owner_phone(_owner_id))
      and (_tenant_id is null or public.can_view_tenant_id(_tenant_id))
      and (_submission_id is null or public.can_view_submission_id(_submission_id))
      and (_transaction_id is null or public.has_permission('accounting', 'view'))
      and (_lease_id is null or exists (select 1 from public.property_leases l where l.id = _lease_id))
    )
  );
$$;

grant execute on function public.can_access_upload(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.can_access_upload(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon, public;

alter policy uploads_select on public.uploads
  using (
    public.has_permission('uploads', 'view')
    and public.can_access_upload(
      uploaded_by, lead_id, offer_id, interaction_id, owner_id, tenant_id,
      property_submission_id, transaction_id, property_lease_id
    )
  );

alter policy uploads_insert on public.uploads
  with check (
    public.has_permission('uploads', 'upload')
    and public.can_access_upload(
      uploaded_by, lead_id, offer_id, interaction_id, owner_id, tenant_id,
      property_submission_id, transaction_id, property_lease_id
    )
  );

alter policy uploads_delete on public.uploads
  using (
    public.has_permission('uploads', 'delete')
    and public.can_access_upload(
      uploaded_by, lead_id, offer_id, interaction_id, owner_id, tenant_id,
      property_submission_id, transaction_id, property_lease_id
    )
  );

-- AI analyses of a lead are visible to whoever can open that lead.
alter policy ai_analyses_select on public.ai_analyses
  using (
    public.has_permission('ai_insights', 'view')
    and (lead_id is null or public.can_access_lead(lead_id))
  );
