-- Scheduled viewings that "do not appear".
--
-- Cause, found in the live data: a viewing was only visible to the agent it was assigned to. When a viewing is
-- booked for a different agent than the lead's own (two of the six live viewings), neither the person who
-- booked it nor the lead's agent could see it on the Viewings page, the lead profile or the calendar. The same
-- happened to every upcoming viewing when a lead was handed to another agent: it stayed with the old agent.
--
--   * A viewing is now also visible to whoever booked it and to anyone who can open its lead. Visibility of
--     other agents' viewings for leads you cannot open is unchanged.
--   * When a lead is handed to another agent, its upcoming scheduled or confirmed viewings that were still
--     with the previous agent move to the new one (viewings deliberately given to someone else stay put).
--     The existing assignment notification tells the new agent.

alter policy viewings_select on public.viewings
  using (
    public.has_permission('viewings', 'view_all')
    or (
      public.has_permission('viewings', 'view_team')
      and exists (
        select 1 from public.team_members tm
         where tm.id = viewings.assigned_agent_id and tm.team_id = public.current_team_id()
      )
    )
    or (
      public.has_permission('viewings', 'view')
      and (
        assigned_agent_id = public.current_team_member_id()
        or created_by = auth.uid()
        or (lead_id is not null and public.can_access_lead(lead_id))
      )
    )
  );

create or replace function public.leads_move_viewings_with_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_agent_id is not null and new.assigned_agent_id is distinct from old.assigned_agent_id then
    update public.viewings v
       set assigned_agent_id = new.assigned_agent_id
     where v.lead_id = new.id
       and v.status in ('scheduled', 'confirmed')
       and v.scheduled_at > now()
       and v.assigned_agent_id is not distinct from old.assigned_agent_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.leads_move_viewings_with_agent() from public, anon, authenticated;

create or replace trigger leads_move_viewings
  after update of assigned_agent_id on public.leads
  for each row execute function public.leads_move_viewings_with_agent();
