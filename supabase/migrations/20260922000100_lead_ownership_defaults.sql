-- Lead ownership defaults (fixes leads that could not be created or imported by agents).
--
-- Problem: leads RLS is own/team/all scoped. A lead inserted with no assigned agent and no team
-- is invisible to an ordinary agent, and because PostgREST returns inserted rows
-- (insert ... returning) under the SELECT policy, the whole insert is rejected with
-- "new row violates row-level security policy". Import and Add Lead both hit this.
--
-- Fix: derive ownership on the server. RLS is not loosened anywhere.
--   * created_by is always the signed-in user on insert.
--   * A caller who cannot see unassigned leads (no leads.view_all) gets the lead assigned to
--     themselves when they did not pick an agent, so it is visible to them straight away.
--   * team_id follows the assigned agent's team, so view_team keeps working. Only callers with
--     leads.view_all may set a different team explicitly.
--   * Reassigning a lead moves it to the new agent's team when that agent has one.
-- Service role and server code (auth.uid() is null) are not touched.

create or replace function public.leads_set_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid;
  v_team uuid;
  v_can_see_all boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_me := public.current_team_member_id();
  v_can_see_all := public.has_permission('leads', 'view_all');

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();

    if new.assigned_agent_id is null and v_me is not null and not v_can_see_all then
      new.assigned_agent_id := v_me;
    end if;

    if new.assigned_agent_id is not null then
      select tm.team_id into v_team from public.team_members tm where tm.id = new.assigned_agent_id;
    end if;

    if v_can_see_all then
      if new.team_id is null then
        new.team_id := v_team;
      end if;
    else
      new.team_id := v_team;
    end if;
  elsif new.assigned_agent_id is distinct from old.assigned_agent_id
        and new.assigned_agent_id is not null then
    select tm.team_id into v_team from public.team_members tm where tm.id = new.assigned_agent_id;
    if v_team is not null then
      new.team_id := v_team;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.leads_set_ownership() from public, anon, authenticated;

drop trigger if exists leads_set_ownership on public.leads;
create trigger leads_set_ownership
  before insert or update of assigned_agent_id on public.leads
  for each row execute function public.leads_set_ownership();

create index if not exists leads_team_id_idx on public.leads (team_id) where team_id is not null;
create index if not exists leads_assigned_agent_id_idx on public.leads (assigned_agent_id);
