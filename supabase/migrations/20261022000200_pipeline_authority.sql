-- Pipeline authority: who may correct a stage, and who may finalise a lead as Won.
--
--   * Ordinary staff stay forward-only (unchanged). A lead that is Won or Lost is still closed to them.
--   * A Super Administrator can move a lead to ANY stage, including backwards, to correct a mistake.
--     Every such move is written to pipeline_history, flagged as a correction, with who did it and why.
--   * Only a Super Administrator or someone holding the new leads "finalize_won" action (granted to
--     Administrator and Accounting) can move a lead INTO Won. Ordinary agents can advance up to
--     Documentation. This is enforced by the database, so the board, the lead form, imports and direct
--     API calls all obey it.
--   * When a lead reaches Documentation, the people who can finalise it are notified.
--   * When a Super Administrator takes a lead back out of Won, the deal records it created are
--     cancelled and the property is made available again, so nothing is left counted as sold.

-- 1. Helpers ---------------------------------------------------------------------------------------

create or replace function public.is_super_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.team_members tm
     where tm.user_id = auth.uid()
       and tm.is_active is true
       and tm.role = 'super_administrator'
  );
$$;

revoke all on function public.is_super_administrator() from public, anon;
grant execute on function public.is_super_administrator() to authenticated;

create or replace function public.can_finalize_won()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_administrator() or public.has_permission('leads', 'finalize_won');
$$;

revoke all on function public.can_finalize_won() from public, anon;
grant execute on function public.can_finalize_won() to authenticated;

-- 2. The new action, for the roles that finalise deals (stored permissions are authoritative) -------

update public.team_members
   set permissions = jsonb_set(
         coalesce(permissions, '{}'::jsonb),
         '{leads}',
         coalesce(permissions -> 'leads', '[]'::jsonb) || '["finalize_won"]'::jsonb
       )
 where role in ('super_administrator', 'administrator', 'accounting')
   and not (coalesce(permissions -> 'leads', '[]'::jsonb) ? 'finalize_won');

-- 3. History: say what kind of move it was, who did it, and why ------------------------------------

alter table public.pipeline_history
  add column if not exists kind text not null default 'move',
  add column if not exists is_correction boolean not null default false,
  add column if not exists reason text,
  add column if not exists changed_by_member uuid references public.team_members (id) on delete set null;

alter table public.pipeline_history
  add constraint pipeline_history_kind_check
  check (kind in ('created', 'move', 'correction', 'reassignment_reset', 'closing'));

-- 4. The rule ---------------------------------------------------------------------------------------

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

  -- A reassignment that starts the lead over for the new agent resets the stage. Only the reassignment
  -- functions set this marker, and only for the lead they are working on.
  if current_setting('app.lead_stage_reset', true) = old.id::text then
    return new;
  end if;

  -- Finalising a deal is reserved. Service-side writes (no signed-in user) are trusted.
  if v_new.is_won and auth.uid() is not null and not public.can_finalize_won() then
    raise exception 'Only a Super Administrator, an authorised Administrator or Accounts can mark a lead as Won. Move it to Documentation and they will finalise it.'
      using errcode = '42501';
  end if;

  -- Super Administrator corrections: any stage, any direction, always recorded in the history.
  if auth.uid() is not null and public.is_super_administrator() then
    return new;
  end if;

  select * into v_old from public.pipeline_stage_info(old.pipeline_stage);
  if not found then
    -- The previous value is not a configured stage (legacy data): nothing to compare against.
    return new;
  end if;

  if v_old.is_won or v_old.is_lost then
    raise exception 'This lead is already closed (%). Only a Super Administrator can correct a closed lead.',
      case when v_old.is_won then 'Won' else 'Lost' end
      using errcode = '23514';
  end if;

  if v_new.stage_position < v_old.stage_position then
    raise exception 'Leads can only move forward in the pipeline. This lead cannot go back from "%" to "%". A Super Administrator can correct a mistaken stage.',
      old.pipeline_stage, new.pipeline_stage
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- A lead cannot be created already Won by someone who may not finalise it.
create or replace function public.leads_enforce_won_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new record;
begin
  select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
  if found and v_new.is_won and auth.uid() is not null and not public.can_finalize_won() then
    raise exception 'Only a Super Administrator, an authorised Administrator or Accounts can create a lead as Won.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger leads_enforce_won_on_insert
  before insert on public.leads
  for each row execute function public.leads_enforce_won_on_insert();

-- One history row per real transition, written by the database, with who and why.
create or replace function public.leads_record_pipeline_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_new record;
  v_kind text;
  v_reason text := nullif(btrim(coalesce(current_setting('app.stage_change_reason', true), '')), '');
  v_member uuid := public.current_team_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.pipeline_history (lead_id, organisation_id, previous_stage, new_stage, changed_by, changed_by_member, kind)
    values (new.id, new.organisation_id, null, new.pipeline_stage, auth.uid(), v_member, 'created');
  elsif new.pipeline_stage is distinct from old.pipeline_stage then
    v_kind := nullif(current_setting('app.stage_change_kind', true), '');
    if v_kind is null then
      select * into v_old from public.pipeline_stage_info(old.pipeline_stage);
      select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
      v_kind := case
        when v_old.stage_position is not null and v_new.stage_position < v_old.stage_position then 'correction'
        else 'move'
      end;
    end if;
    insert into public.pipeline_history (lead_id, organisation_id, previous_stage, new_stage, changed_by, changed_by_member, kind, is_correction, reason)
    values (new.id, new.organisation_id, old.pipeline_stage, new.pipeline_stage, auth.uid(), v_member, v_kind, v_kind = 'correction', v_reason);
  end if;
  return null;
end;
$$;

-- 5. Taking a lead back out of Won also takes back what Won recorded ---------------------------------

create or replace function public.leads_after_leave_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_new record;
  r record;
begin
  if new.pipeline_stage is not distinct from old.pipeline_stage then
    return null;
  end if;
  select * into v_old from public.pipeline_stage_info(old.pipeline_stage);
  select * into v_new from public.pipeline_stage_info(new.pipeline_stage);
  if not coalesce(v_old.is_won, false) or coalesce(v_new.is_won, false) then
    return null;
  end if;

  for r in
    update public.transactions
       set status = 'cancelled',
           notes = left(coalesce(notes || E'\n', '') || 'Cancelled: the lead was moved out of Won by a Super Administrator.', 2000)
     where lead_id = new.id and status = 'closed'
    returning property_id
  loop
    -- The property is available again unless another closed deal still holds it.
    update public.properties p
       set availability = 'available'
     where p.id = r.property_id
       and p.availability in ('sold', 'rented')
       and not exists (
         select 1 from public.transactions t
          where t.property_id = p.id and t.status = 'closed'
       );
  end loop;
  return null;
end;
$$;

create or replace trigger leads_after_leave_won
  after update of pipeline_stage on public.leads
  for each row execute function public.leads_after_leave_won();

-- 6. Tell the people who can finalise a deal when it is ready -------------------------------------------

create or replace function public.leads_notify_ready_to_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.pipeline_stage is distinct from old.pipeline_stage and new.pipeline_stage = 'documentation' then
    for r in
      select tm.id, tm.role
        from public.team_members tm
       where coalesce(tm.is_active, true)
         and tm.user_id is not null
         and (tm.role = 'super_administrator' or coalesce(tm.permissions -> 'leads', '[]'::jsonb) ? 'finalize_won')
    loop
      perform public.enqueue_staff_notification(
        r.id,
        'Deal ready to close',
        new.full_name || ' has reached Documentation',
        case when r.role = 'accounting' then '/accounting' else '/leads/' || new.id::text end,
        'lead_ready_to_close',
        'leads',
        new.id,
        'ready_to_close:' || to_char(now(), 'YYYYMMDDHH24MISS')
      );
    end loop;
  end if;
  return null;
end;
$$;

create or replace trigger leads_notify_ready_to_close
  after update of pipeline_stage on public.leads
  for each row execute function public.leads_notify_ready_to_close();

-- 7. A stage change that records its reason (Super Administrator corrections prompt for one) ----------

create or replace function public.move_lead_stage(_lead_id uuid, _stage text, _reason text default null)
returns text
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.stage_change_reason', left(btrim(coalesce(_reason, '')), 500), true);
  update public.leads set pipeline_stage = _stage where id = _lead_id;
  if not found then
    perform set_config('app.stage_change_reason', '', true);
    raise exception 'That lead could not be found, or you cannot change it.' using errcode = '42501';
  end if;
  perform set_config('app.stage_change_reason', '', true);
  return _stage;
end;
$$;

revoke all on function public.move_lead_stage(uuid, text, text) from public, anon;
grant execute on function public.move_lead_stage(uuid, text, text) to authenticated;

-- 8. History is only readable for leads the caller can see (it used to be readable for every lead) ----

alter policy pipeline_history_select on public.pipeline_history
  using (public.can_access_lead(lead_id));

-- Trigger functions run when their trigger fires; nobody needs to call them through the API.
revoke execute on function public.leads_enforce_won_on_insert() from public, anon, authenticated;
revoke execute on function public.leads_after_leave_won() from public, anon, authenticated;
revoke execute on function public.leads_notify_ready_to_close() from public, anon, authenticated;
