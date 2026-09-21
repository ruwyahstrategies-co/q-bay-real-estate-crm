-- Owner phone privacy, step 2 of 2: remove direct read access to owners.phone.
--
-- Apply only after the CRM build that reads owners through explicit columns and
-- get_owner_phones() is deployed (select("*") on owners is rejected from here on).
--
-- Client roles lose SELECT on owners.phone. Every other owners column stays readable
-- under the existing owners_select RLS policy. The raw number can only be obtained
-- through get_owner_phones() / search_owners(), which enforce can_view_owner_phone().
-- service_role (edge functions) and SECURITY DEFINER triggers are unaffected.

revoke select on public.owners from anon, authenticated;
grant select (
  id, name, company, email, notes, created_at, updated_at, code,
  is_developer, address, assigned_agent_id, source_lead_id, is_demo, id_number
) on public.owners to authenticated;

-- scheduled_notifications.recipient_phone is copied from owners.phone by the expiry and
-- congratulation triggers, and was readable by anyone with owners.view. Close that path.
revoke select on public.scheduled_notifications from anon, authenticated;
grant select (
  id, template_key, event_type, owner_id, recipient_name, body, related_table,
  related_id, status, scheduled_for, sent_at, provider, provider_message_id,
  error_message, created_at, updated_at
) on public.scheduled_notifications to authenticated;

-- Fill the recipient phone on the server so the browser never has to send an owner number.
create or replace function public.scheduled_notifications_fill_owner_phone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.owner_id is not null and (new.recipient_phone is null or trim(new.recipient_phone) = '') then
    select o.phone into new.recipient_phone from public.owners o where o.id = new.owner_id;
  end if;
  return new;
end;
$$;

revoke all on function public.scheduled_notifications_fill_owner_phone() from public, anon, authenticated;

drop trigger if exists scheduled_notifications_fill_owner_phone on public.scheduled_notifications;
create trigger scheduled_notifications_fill_owner_phone
  before insert on public.scheduled_notifications
  for each row execute function public.scheduled_notifications_fill_owner_phone();
