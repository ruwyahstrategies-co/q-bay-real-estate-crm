-- Lead outcome: "Rented from Outside".
--
-- A Rent lead who found and rented a property outside Q-Bay inventory. This is a terminal
-- disposition of the lead, NOT a Q-Bay transaction: nothing is written to transactions or
-- property_leases, and it is clearly separate from a won lead (a successful Q-Bay rental).
--
-- Model: an explicit outcome on the lead (not free-text notes), with when/who/short note.
-- The lead also moves to the terminal 'lost' stage, so every "open pipeline" view drops it,
-- while reports can still separate lost-to-outside-rental from other lost leads by outcome.
-- The outcome list is a check constraint so further closed/lost reasons are one small
-- migration away. Moving a lead back out of 'lost' clears the outcome automatically.

alter table public.leads
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_note text,
  add column if not exists outcome_by uuid references public.team_members(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_outcome_check') then
    alter table public.leads
      add constraint leads_outcome_check
      check (outcome is null or outcome in ('rented_from_outside'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_outcome_rent_only_check') then
    alter table public.leads
      add constraint leads_outcome_rent_only_check
      check (outcome is distinct from 'rented_from_outside' or transaction_intent = 'rent');
  end if;
end $$;

create index if not exists leads_outcome_idx on public.leads (outcome) where outcome is not null;

-- Reopening a lead (moving it out of 'lost') removes the outcome so the two never disagree.
create or replace function public.leads_clear_outcome_on_reopen()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.outcome is not null and new.pipeline_stage is distinct from 'lost' then
    new.outcome := null;
    new.outcome_at := null;
    new.outcome_note := null;
    new.outcome_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.leads_clear_outcome_on_reopen() from public, anon, authenticated;

drop trigger if exists leads_clear_outcome_on_reopen on public.leads;
create trigger leads_clear_outcome_on_reopen
  before update of pipeline_stage on public.leads
  for each row execute function public.leads_clear_outcome_on_reopen();

-- One atomic action. SECURITY INVOKER on purpose: every read and write below runs under the
-- caller's own row level security, so an agent can only close a lead they are allowed to edit.
create or replace function public.mark_lead_rented_from_outside(_lead_id uuid, _note text default null)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_lead public.leads%rowtype;
  v_me uuid := public.current_team_member_id();
  v_note text := nullif(btrim(coalesce(_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = _lead_id;
  if not found then
    raise exception 'Lead not found, or you do not have access to it' using errcode = '42501';
  end if;
  if v_lead.transaction_intent <> 'rent' then
    raise exception 'Only Rent leads can be marked as rented from outside' using errcode = '23514';
  end if;
  if v_lead.outcome is not null then
    raise exception 'This lead already has an outcome' using errcode = '23514';
  end if;
  if v_lead.pipeline_stage = 'won' then
    raise exception 'A won lead was rented through Q-Bay and cannot be marked as rented from outside'
      using errcode = '23514';
  end if;

  update public.leads
     set outcome = 'rented_from_outside',
         outcome_at = now(),
         outcome_note = v_note,
         outcome_by = v_me,
         pipeline_stage = 'lost'
   where id = _lead_id;
  if not found then
    raise exception 'You do not have permission to update this lead' using errcode = '42501';
  end if;

  insert into public.pipeline_history (lead_id, previous_stage, new_stage, changed_by)
  values (_lead_id, v_lead.pipeline_stage, 'lost', auth.uid());

  if public.has_permission('leads', 'edit') then
    insert into public.lead_notes (lead_id, content, author_id)
    values (
      _lead_id,
      'Marked as Rented from Outside (rented a property outside Q-Bay).'
        || case when v_note is not null then ' ' || v_note else '' end,
      v_me
    );
  end if;
end;
$$;

revoke all on function public.mark_lead_rented_from_outside(uuid, text) from public, anon;
grant execute on function public.mark_lead_rented_from_outside(uuid, text) to authenticated;
