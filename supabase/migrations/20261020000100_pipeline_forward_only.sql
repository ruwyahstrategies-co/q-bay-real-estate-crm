-- Forward-only Sales pipeline, enforced in the database.
--
-- A lead may stay where it is or move to a LATER stage (by the position configured in
-- pipeline_stages). It may never move to an earlier stage, and a lead that is Won or Lost is
-- closed. The rule lives on the leads table, so the Kanban board, the lead form, imports and
-- direct API calls all pass through it. Pipeline history is written here too, once per real
-- transition, instead of by each screen.

-- Stage lookup that works for any caller (pipeline_stages is only readable with pipeline/settings
-- permissions, but the rule must hold for every writer of leads).
create or replace function public.pipeline_stage_info(_key text)
returns table(stage_position integer, is_won boolean, is_lost boolean, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.position, s.is_won, s.is_lost, s.is_active
    from public.pipeline_stages s
   where s.stage_key = _key
   limit 1;
$$;

revoke all on function public.pipeline_stage_info(text) from public, anon;
grant execute on function public.pipeline_stage_info(text) to authenticated;

create or replace function public.leads_enforce_forward_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_new record;
begin
  if new.pipeline_stage is not distinct from old.pipeline_stage then
    return new;
  end if;

  select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
  if not found then
    raise exception 'Unknown pipeline stage "%"', new.pipeline_stage
      using errcode = '22023';
  end if;

  select * into v_old from public.pipeline_stage_info(old.pipeline_stage);
  if not found then
    -- The previous value is not a configured stage (legacy data): nothing to compare against.
    return new;
  end if;

  if v_old.is_won or v_old.is_lost then
    raise exception 'This lead is already closed (%). A closed lead cannot be moved back into the pipeline.',
      case when v_old.is_won then 'Won' else 'Lost' end
      using errcode = '23514';
  end if;

  if v_new.stage_position < v_old.stage_position then
    raise exception 'Leads can only move forward in the pipeline. This lead cannot go back from "%" to "%".',
      old.pipeline_stage, new.pipeline_stage
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace trigger leads_enforce_forward_pipeline
  before update of pipeline_stage on public.leads
  for each row execute function public.leads_enforce_forward_pipeline();

-- One pipeline_history row per real transition, written by the database.
create or replace function public.leads_record_pipeline_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_history (lead_id, organisation_id, previous_stage, new_stage, changed_by)
    values (new.id, new.organisation_id, null, new.pipeline_stage, auth.uid());
  elsif new.pipeline_stage is distinct from old.pipeline_stage then
    insert into public.pipeline_history (lead_id, organisation_id, previous_stage, new_stage, changed_by)
    values (new.id, new.organisation_id, old.pipeline_stage, new.pipeline_stage, auth.uid());
  end if;
  return null;
end;
$$;

create or replace trigger leads_record_pipeline_history
  after insert or update of pipeline_stage on public.leads
  for each row execute function public.leads_record_pipeline_history();

-- Older browser sessions still insert their own history row right after changing the stage. Drop
-- an exact repeat of a transition recorded in the last two minutes so history never doubles up.
create or replace function public.pipeline_history_skip_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.pipeline_history h
     where h.lead_id = new.lead_id
       and h.previous_stage is not distinct from new.previous_stage
       and h.new_stage = new.new_stage
       and h.changed_at > now() - interval '2 minutes'
  ) then
    return null;
  end if;
  return new;
end;
$$;

create or replace trigger pipeline_history_skip_duplicate
  before insert on public.pipeline_history
  for each row execute function public.pipeline_history_skip_duplicate();
