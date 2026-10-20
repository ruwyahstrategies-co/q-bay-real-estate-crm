-- Notify the right people about property approvals.
--   * Administrators / Super Administrators (anyone with the "approve" permission) are told when a property is
--     submitted, resubmitted or sent back for review after an edit.
--   * The agent who submitted a property is told when it is approved, rejected or returned for changes.
-- A problem creating a notification must never stop a property from being saved or reviewed.

create or replace function public.property_approval_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop record;
  v_label text;
  r record;
begin
  select p.id, p.title, p.reference_code, p.submitted_by
    into v_prop
    from public.properties p
   where p.id = new.property_id;
  if not found then
    return null;
  end if;
  v_label := coalesce(v_prop.reference_code || ' - ', '') || v_prop.title;

  begin
    if new.action in ('submitted', 'resubmitted', 'edited_after_approval') then
      for r in
        select tm.id
          from public.team_members tm
         where coalesce(tm.is_active, true)
           and (tm.permissions -> 'properties') ? 'approve'
           and tm.id is distinct from new.actor_team_member_id
      loop
        perform public.enqueue_staff_notification(
          r.id,
          'Property waiting for approval',
          v_label,
          '/properties/' || v_prop.id::text,
          'property_approval',
          'property_approval_events',
          new.id,
          'review:' || new.id::text
        );
      end loop;
    elsif new.action in ('approved', 'rejected', 'changes_requested')
          and v_prop.submitted_by is not null
          and v_prop.submitted_by is distinct from new.actor_team_member_id then
      perform public.enqueue_staff_notification(
        v_prop.submitted_by,
        case new.action
          when 'approved' then 'Property approved'
          when 'rejected' then 'Property rejected'
          else 'Property returned for changes'
        end,
        v_label || coalesce(': ' || new.note, ''),
        '/properties/' || v_prop.id::text,
        'property_approval',
        'property_approval_events',
        new.id,
        'decision:' || new.id::text
      );
    end if;
  exception when others then
    null;
  end;

  return null;
end;
$$;

create or replace trigger property_approval_notify
  after insert on public.property_approval_events
  for each row execute function public.property_approval_notify();
