-- Viewing workflow: one viewing record, linked to its lead, property and agent, that moves the
-- lead to "Viewing Scheduled" and keeps its own history.
--
-- Rules implemented here (so every screen and every API caller gets them):
--   * Scheduling a viewing advances the lead to the configured Viewing Scheduled stage, in the
--     same transaction as the insert. The stage change is forward-only (see the pipeline
--     migration), so a lead that is already further along is never moved back.
--   * Rescheduling updates the SAME viewing row (same id, same links). It is never a new row.
--   * Cancelling changes the appointment status and keeps its history. It does NOT move the lead
--     back in the pipeline: appointment status and pipeline progress are separate things.
--   * Every schedule / reschedule / cancel / complete / reassign is written to viewing_events.

alter table public.viewings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists last_rescheduled_at timestamptz,
  add column if not exists created_by uuid;

create index if not exists viewings_scheduled_at_idx on public.viewings (scheduled_at);
create index if not exists viewings_status_idx on public.viewings (status);

-- Does the signed-in staff member have access to this lead? Mirrors the leads SELECT policy
-- exactly, for places (policies, definer triggers) that must not widen access.
create or replace function public.can_access_lead(_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.leads l
     where l.id = _lead_id
       and (
         public.has_permission('leads', 'view_all')
         or (public.has_permission('leads', 'view_team') and l.team_id is not null and l.team_id = public.current_team_id())
         or (public.has_permission('leads', 'view') and l.assigned_agent_id = public.current_team_member_id())
       )
  );
$$;

revoke all on function public.can_access_lead(uuid) from public, anon;
grant execute on function public.can_access_lead(uuid) to authenticated;

-- A viewing can only be created for a lead the caller can access.
alter policy viewings_insert on public.viewings
  with check (
    public.has_permission('viewings', 'create')
    and (lead_id is null or public.can_access_lead(lead_id))
  );

create table if not exists public.viewing_events (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  lead_id uuid,
  property_id uuid,
  action text not null check (action in (
    'scheduled', 'rescheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'reassigned', 'property_changed'
  )),
  from_status text,
  to_status text,
  from_scheduled_at timestamptz,
  to_scheduled_at timestamptz,
  note text,
  actor_user_id uuid,
  actor_team_member_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists viewing_events_viewing_idx on public.viewing_events (viewing_id, created_at desc);
create index if not exists viewing_events_lead_idx on public.viewing_events (lead_id);

alter table public.viewing_events enable row level security;

-- Visible exactly when the viewing itself is visible (the subselect runs under the caller's RLS).
create policy viewing_events_select on public.viewing_events
  for select to authenticated
  using (exists (select 1 from public.viewings v where v.id = viewing_events.viewing_id));

-- Nobody writes history by hand: rows are created by the trigger below.
revoke all on public.viewing_events from anon, authenticated;
grant select on public.viewing_events to authenticated;

-- Advance a lead to the configured Viewing Scheduled stage. Forward-only: a lead that is already at
-- or past that stage, or closed, is left alone. Returns the stage key it moved to, or null.
create or replace function public.advance_lead_for_viewing(_lead_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target record;
  v_current text;
  v_current_info record;
begin
  select s.stage_key, s.position, s.is_active
    into v_target
    from public.pipeline_stages s
   where s.stage_key = 'viewing_scheduled' or lower(s.name) = 'viewing scheduled'
   order by (s.stage_key = 'viewing_scheduled') desc
   limit 1;
  if not found or not v_target.is_active then
    return null;
  end if;

  select l.pipeline_stage into v_current from public.leads l where l.id = _lead_id for update;
  if v_current is null then
    return null;
  end if;

  select * into v_current_info from public.pipeline_stage_info(v_current);
  if not found then
    return null;
  end if;
  if v_current_info.is_won or v_current_info.is_lost then
    return null;
  end if;
  if v_current_info.stage_position >= v_target.position then
    return null;
  end if;

  update public.leads set pipeline_stage = v_target.stage_key where id = _lead_id;
  return v_target.stage_key;
end;
$$;

revoke all on function public.advance_lead_for_viewing(uuid) from public, anon, authenticated;

create or replace function public.viewings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;

  if old.status = 'completed' and new.scheduled_at is distinct from old.scheduled_at then
    raise exception 'A completed viewing cannot be rescheduled.' using errcode = '23514';
  end if;

  if new.scheduled_at is distinct from old.scheduled_at then
    new.reschedule_count := coalesce(old.reschedule_count, 0) + 1;
    new.last_rescheduled_at := now();
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status is distinct from 'cancelled' and old.status = 'cancelled' then
    new.cancelled_at := null;
    new.cancellation_reason := null;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create or replace trigger viewings_before_write
  before insert or update on public.viewings
  for each row execute function public.viewings_before_write();

create or replace function public.viewings_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_note text := nullif(current_setting('app.viewing_event_note', true), '');
  v_actor_member uuid := public.current_team_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.viewing_events (viewing_id, lead_id, property_id, action, to_status, to_scheduled_at, note, actor_user_id, actor_team_member_id)
    values (new.id, new.lead_id, new.property_id, 'scheduled', new.status, new.scheduled_at, v_note, auth.uid(), v_actor_member);
  else
    if new.status is distinct from old.status then
      v_action := case new.status
        when 'completed' then 'completed'
        when 'cancelled' then 'cancelled'
        when 'confirmed' then 'confirmed'
        when 'no_show' then 'no_show'
        when 'scheduled' then 'rescheduled'
        else null
      end;
    elsif new.scheduled_at is distinct from old.scheduled_at then
      v_action := 'rescheduled';
    end if;

    if v_action is not null then
      insert into public.viewing_events (viewing_id, lead_id, property_id, action, from_status, to_status, from_scheduled_at, to_scheduled_at, note, actor_user_id, actor_team_member_id)
      values (new.id, new.lead_id, new.property_id, v_action, old.status, new.status, old.scheduled_at, new.scheduled_at,
              coalesce(v_note, case when v_action = 'cancelled' then new.cancellation_reason end), auth.uid(), v_actor_member);
    end if;

    if new.assigned_agent_id is distinct from old.assigned_agent_id then
      insert into public.viewing_events (viewing_id, lead_id, property_id, action, from_status, to_status, note, actor_user_id, actor_team_member_id)
      values (new.id, new.lead_id, new.property_id, 'reassigned', old.status, new.status, null, auth.uid(), v_actor_member);
    end if;

    if new.property_id is distinct from old.property_id then
      insert into public.viewing_events (viewing_id, lead_id, property_id, action, from_status, to_status, note, actor_user_id, actor_team_member_id)
      values (new.id, new.lead_id, new.property_id, 'property_changed', old.status, new.status, null, auth.uid(), v_actor_member);
    end if;
  end if;

  -- Same transaction as the viewing itself: if the stage cannot be advanced because of an error,
  -- the viewing is not saved either. A lead that is already further along is simply left alone.
  if new.lead_id is not null and new.status in ('scheduled', 'confirmed') then
    perform public.advance_lead_for_viewing(new.lead_id);
  end if;

  return null;
end;
$$;

create or replace trigger viewings_after_write
  after insert or update on public.viewings
  for each row execute function public.viewings_after_write();

-- ---------------------------------------------------------------------------------------------
-- Operations. SECURITY INVOKER: the caller's own row-level security decides what they may touch.
-- ---------------------------------------------------------------------------------------------

create or replace function public.schedule_viewing(
  _lead_id uuid,
  _property_id uuid,
  _scheduled_at timestamptz,
  _agent_id uuid default null,
  _notes text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_agent uuid;
  v_dup uuid;
  v_before text;
  v_after text;
begin
  if _lead_id is null then
    raise exception 'Choose the lead for this viewing.' using errcode = '22023';
  end if;
  if _property_id is null then
    raise exception 'Choose the property to be viewed.' using errcode = '22023';
  end if;
  if _scheduled_at is null then
    raise exception 'Choose a date and time for the viewing.' using errcode = '22023';
  end if;
  if not public.has_permission('viewings', 'create') then
    raise exception 'You do not have permission to schedule viewings.' using errcode = '42501';
  end if;
  if not public.can_access_lead(_lead_id) then
    raise exception 'You do not have access to this lead.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.properties p where p.id = _property_id) then
    raise exception 'That property could not be found.' using errcode = '22023';
  end if;

  -- A double click or a retry must not create a second appointment.
  select v.id into v_dup
    from public.viewings v
   where v.lead_id = _lead_id
     and v.property_id = _property_id
     and v.scheduled_at = _scheduled_at
     and v.status in ('scheduled', 'confirmed')
   limit 1;
  if v_dup is not null then
    return jsonb_build_object('viewing_id', v_dup, 'duplicate', true, 'stage_advanced', false);
  end if;

  v_agent := coalesce(
    _agent_id,
    (select l.assigned_agent_id from public.leads l where l.id = _lead_id),
    public.current_team_member_id()
  );

  select l.pipeline_stage into v_before from public.leads l where l.id = _lead_id;

  insert into public.viewings (id, lead_id, property_id, assigned_agent_id, scheduled_at, status, notes)
  values (v_id, _lead_id, _property_id, v_agent, _scheduled_at, 'scheduled', nullif(btrim(coalesce(_notes, '')), ''));

  select l.pipeline_stage into v_after from public.leads l where l.id = _lead_id;

  return jsonb_build_object(
    'viewing_id', v_id,
    'duplicate', false,
    'stage_advanced', v_before is distinct from v_after,
    'previous_stage', v_before,
    'new_stage', v_after
  );
end;
$$;

create or replace function public.reschedule_viewing(
  _viewing_id uuid,
  _scheduled_at timestamptz,
  _property_id uuid default null,
  _agent_id uuid default null,
  _note text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v public.viewings%rowtype;
  v_rows integer;
begin
  if not public.has_permission('viewings', 'edit') then
    raise exception 'You do not have permission to reschedule viewings.' using errcode = '42501';
  end if;
  if _scheduled_at is null then
    raise exception 'Choose the new date and time.' using errcode = '22023';
  end if;

  select * into v from public.viewings where id = _viewing_id;
  if not found then
    raise exception 'That viewing could not be found, or you cannot access it.' using errcode = 'P0002';
  end if;
  if v.status = 'completed' then
    raise exception 'A completed viewing cannot be rescheduled.' using errcode = '23514';
  end if;
  if _property_id is not null
     and not exists (select 1 from public.properties p where p.id = _property_id) then
    raise exception 'That property could not be found.' using errcode = '22023';
  end if;

  if v.scheduled_at = _scheduled_at
     and v.status = 'scheduled'
     and (_property_id is null or _property_id = v.property_id)
     and (_agent_id is null or _agent_id = v.assigned_agent_id) then
    return jsonb_build_object('viewing_id', v.id, 'unchanged', true);
  end if;

  perform set_config('app.viewing_event_note', coalesce(btrim(_note), ''), true);

  update public.viewings
     set scheduled_at = _scheduled_at,
         property_id = coalesce(_property_id, property_id),
         assigned_agent_id = coalesce(_agent_id, assigned_agent_id),
         status = 'scheduled'
   where id = _viewing_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this viewing.' using errcode = '42501';
  end if;

  perform set_config('app.viewing_event_note', '', true);
  return jsonb_build_object('viewing_id', v.id, 'unchanged', false);
end;
$$;

create or replace function public.cancel_viewing(_viewing_id uuid, _reason text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v public.viewings%rowtype;
  v_rows integer;
begin
  if not public.has_permission('viewings', 'edit') then
    raise exception 'You do not have permission to cancel viewings.' using errcode = '42501';
  end if;

  select * into v from public.viewings where id = _viewing_id;
  if not found then
    raise exception 'That viewing could not be found, or you cannot access it.' using errcode = 'P0002';
  end if;
  if v.status not in ('scheduled', 'confirmed') then
    raise exception 'Only a scheduled or confirmed viewing can be cancelled.' using errcode = '23514';
  end if;

  -- Cancelling updates the appointment only. The lead keeps its pipeline stage.
  update public.viewings
     set status = 'cancelled',
         cancellation_reason = nullif(btrim(coalesce(_reason, '')), '')
   where id = _viewing_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this viewing.' using errcode = '42501';
  end if;

  return jsonb_build_object('viewing_id', v.id);
end;
$$;

create or replace function public.complete_viewing(
  _viewing_id uuid,
  _notes text default null,
  _latitude numeric default null,
  _longitude numeric default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v public.viewings%rowtype;
  v_rows integer;
begin
  if not public.has_permission('viewings', 'complete') then
    raise exception 'You do not have permission to complete viewings.' using errcode = '42501';
  end if;

  select * into v from public.viewings where id = _viewing_id;
  if not found then
    raise exception 'That viewing could not be found, or you cannot access it.' using errcode = 'P0002';
  end if;
  if v.status not in ('scheduled', 'confirmed') then
    raise exception 'Only a scheduled or confirmed viewing can be completed.' using errcode = '23514';
  end if;

  update public.viewings
     set status = 'completed',
         completed_at = now(),
         notes = coalesce(nullif(btrim(coalesce(_notes, '')), ''), notes),
         latitude = coalesce(_latitude, latitude),
         longitude = coalesce(_longitude, longitude)
   where id = _viewing_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this viewing.' using errcode = '42501';
  end if;

  return jsonb_build_object('viewing_id', v.id);
end;
$$;

create or replace function public.confirm_viewing(_viewing_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v public.viewings%rowtype;
  v_rows integer;
begin
  if not public.has_permission('viewings', 'edit') then
    raise exception 'You do not have permission to confirm viewings.' using errcode = '42501';
  end if;

  select * into v from public.viewings where id = _viewing_id;
  if not found then
    raise exception 'That viewing could not be found, or you cannot access it.' using errcode = 'P0002';
  end if;
  if v.status <> 'scheduled' then
    raise exception 'Only a scheduled viewing can be confirmed.' using errcode = '23514';
  end if;

  update public.viewings set status = 'confirmed' where id = _viewing_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You do not have permission to change this viewing.' using errcode = '42501';
  end if;

  return jsonb_build_object('viewing_id', v.id);
end;
$$;

revoke all on function public.schedule_viewing(uuid, uuid, timestamptz, uuid, text) from public, anon;
revoke all on function public.reschedule_viewing(uuid, timestamptz, uuid, uuid, text) from public, anon;
revoke all on function public.cancel_viewing(uuid, text) from public, anon;
revoke all on function public.complete_viewing(uuid, text, numeric, numeric) from public, anon;
revoke all on function public.confirm_viewing(uuid) from public, anon;
grant execute on function public.schedule_viewing(uuid, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.reschedule_viewing(uuid, timestamptz, uuid, uuid, text) to authenticated;
grant execute on function public.cancel_viewing(uuid, text) to authenticated;
grant execute on function public.complete_viewing(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.confirm_viewing(uuid) to authenticated;
