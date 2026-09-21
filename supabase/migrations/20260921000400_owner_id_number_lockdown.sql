-- Owner id_number lockdown. Apply only after the CRM build that reads id_number through
-- get_owner_private_fields() (and no longer lists id_number in owners selects) is deployed.

revoke select on public.owners from anon, authenticated;
grant select (
  id, name, company, email, notes, created_at, updated_at, code,
  is_developer, address, assigned_agent_id, source_lead_id, is_demo
) on public.owners to authenticated;
