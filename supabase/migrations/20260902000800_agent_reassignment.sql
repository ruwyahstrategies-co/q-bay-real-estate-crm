-- Q-Bay Real Estate CRM — Reassignment before user deletion (module L).
--
-- One RPC, one transaction: reassigns every record type a departing agent
-- might hold, each to its own optional replacement agent (or leaves it
-- unassigned if no replacement is given for that category). Runs as the
-- caller (not security definer) so the existing RLS write policies on each
-- table still gate who can do this.

create or replace function public.reassign_team_member_records(
  _from_agent_id uuid,
  _to_leads uuid default null,
  _to_properties uuid default null,
  _to_developments uuid default null,
  _to_owners uuid default null,
  _to_viewings uuid default null,
  _to_offers uuid default null,
  _to_tasks uuid default null,
  _to_transactions uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_leads int := 0;
  n_properties int := 0;
  n_developments int := 0;
  n_owners int := 0;
  n_viewings int := 0;
  n_offers int := 0;
  n_tasks int := 0;
  n_transactions int := 0;
begin
  if _from_agent_id is null then
    raise exception 'from_agent_id is required';
  end if;

  if _to_leads is not null then
    update public.leads set assigned_agent_id = _to_leads where assigned_agent_id = _from_agent_id;
    get diagnostics n_leads = row_count;
  end if;

  if _to_properties is not null then
    update public.properties set assigned_agent_id = _to_properties where assigned_agent_id = _from_agent_id;
    get diagnostics n_properties = row_count;
  end if;

  if _to_developments is not null then
    update public.developments set assigned_agent_id = _to_developments where assigned_agent_id = _from_agent_id;
    get diagnostics n_developments = row_count;
  end if;

  if _to_owners is not null then
    update public.owners set assigned_agent_id = _to_owners where assigned_agent_id = _from_agent_id;
    get diagnostics n_owners = row_count;
  end if;

  if _to_viewings is not null then
    update public.viewings set assigned_agent_id = _to_viewings where assigned_agent_id = _from_agent_id;
    get diagnostics n_viewings = row_count;
  end if;

  if _to_offers is not null then
    update public.offers set agent_id = _to_offers where agent_id = _from_agent_id;
    get diagnostics n_offers = row_count;
  end if;

  if _to_tasks is not null then
    update public.tasks set assigned_to = _to_tasks where assigned_to = _from_agent_id;
    get diagnostics n_tasks = row_count;
  end if;

  if _to_transactions is not null then
    update public.transactions set agent_id = _to_transactions where agent_id = _from_agent_id;
    get diagnostics n_transactions = row_count;
  end if;

  return jsonb_build_object(
    'leads', n_leads, 'properties', n_properties, 'developments', n_developments,
    'owners', n_owners, 'viewings', n_viewings, 'offers', n_offers,
    'tasks', n_tasks, 'transactions', n_transactions
  );
end;
$$;

revoke execute on function public.reassign_team_member_records(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.reassign_team_member_records(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
