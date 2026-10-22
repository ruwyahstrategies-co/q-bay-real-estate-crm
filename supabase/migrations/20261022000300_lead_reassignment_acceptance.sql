-- Lead handover with acceptance.
--
-- Handing a lead to another agent is a request, not an instant change:
--   * The person handing it over chooses the receiving agent, whether the pipeline starts all over for
--     them ("start_over") or carries on from where the previous agent got to ("continue"), and how long
--     the receiving agent has to accept (minutes, hours or days, stored as one absolute deadline).
--   * The lead stays with the current agent until the receiving agent accepts. A declined or expired
--     request notifies the requester and the Super Administrators. Nothing is finalised silently.
--   * Deadlines are enforced by the database: a cron job expires overdue requests every minute, and
--     the same function runs when anyone responds, so a late "accept" is refused.
--   * Every step (requested, accepted, declined, expired, cancelled, and the hand-over itself) is
--     kept in assignment_events with who did it and when. Pipeline history is never deleted: starting
--     over only adds a new row.
--   * The database refuses any other change of a lead's assigned agent, so list screens, forms,
--     imports and direct API calls cannot bypass the flow.

-- 1. History -------------------------------------------------------------------------------------------

alter table public.assignment_events
  add column if not exists event_type text not null default 'reassigned',
  add column if not exists request_id uuid,
  add column if not exists mode text;

alter table public.assignment_events
  add constraint assignment_events_type_check
  check (event_type in ('reassigned', 'requested', 'accepted', 'rejected', 'expired', 'cancelled'));

alter table public.assignment_events
  add constraint assignment_events_mode_check
  check (mode is null or mode in ('start_over', 'continue'));

-- 2. Requests --------------------------------------------------------------------------------------------

create table if not exists public.lead_reassignment_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  lead_name text not null,
  lead_stage text,
  from_agent_id uuid references public.team_members (id) on delete set null,
  to_agent_id uuid not null references public.team_members (id) on delete cascade,
  requested_by uuid references public.team_members (id) on delete set null,
  mode text not null check (mode in ('start_over', 'continue')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  reason text,
  deadline_at timestamptz not null,
  batch_id uuid,
  response_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- A lead can have only one open request at a time.
create unique index if not exists lead_reassignment_one_pending
  on public.lead_reassignment_requests (lead_id) where status = 'pending';
create index if not exists lead_reassignment_to_idx on public.lead_reassignment_requests (to_agent_id, status);
create index if not exists lead_reassignment_deadline_idx
  on public.lead_reassignment_requests (deadline_at) where status = 'pending';

alter table public.lead_reassignment_requests enable row level security;

create policy lead_reassignment_select on public.lead_reassignment_requests
  for select to authenticated
  using (
    to_agent_id = public.current_team_member_id()
    or from_agent_id = public.current_team_member_id()
    or requested_by = public.current_team_member_id()
    or public.has_permission('leads', 'reassign')
    or public.can_access_lead(lead_id)
  );

-- Written only by the functions below.
revoke all on public.lead_reassignment_requests from anon, authenticated;
grant select on public.lead_reassignment_requests to authenticated;

-- 3. Guard: a lead's agent only changes through the flow ------------------------------------------------

create or replace function public.leads_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.assigned_agent_id is not null
     and new.assigned_agent_id is distinct from old.assigned_agent_id
     and coalesce(current_setting('app.lead_reassign_ok', true), '') not in (old.id::text, '*') then
    raise exception 'A lead is handed to another agent through Reassign: choose Start all over or Continue, and the new agent accepts. Its agent cannot be changed directly.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger leads_guard_assignment
  before update of assigned_agent_id on public.leads
  for each row execute function public.leads_guard_assignment();

revoke execute on function public.leads_guard_assignment() from public, anon, authenticated;

-- 4. Notifying the requester and the Super Administrators ---------------------------------------------

create or replace function public._notify_reassignment_admins(
  _req public.lead_reassignment_requests,
  _title text,
  _body text,
  _event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct tm.id
      from public.team_members tm
     where coalesce(tm.is_active, true)
       and tm.user_id is not null
       and (
         tm.id = _req.requested_by
         or tm.role = 'super_administrator'
         or coalesce(tm.permissions -> 'leads', '[]'::jsonb) ? 'reassign'
       )
  loop
    perform public.enqueue_staff_notification(
      r.id, _title, _body, '/leads/' || _req.lead_id::text,
      'lead_reassignment_result', 'lead_reassignment_requests', _req.id, _event
    );
  end loop;
end;
$$;

revoke execute on function public._notify_reassignment_admins(public.lead_reassignment_requests, text, text, text)
  from public, anon, authenticated;

-- 5. Ask for a hand-over (one lead or many) ---------------------------------------------------------------

create or replace function public.request_lead_reassignment(
  _lead_ids uuid[],
  _to_agent_id uuid,
  _mode text,
  _deadline_minutes integer,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  v_batch uuid := gen_random_uuid();
  v_deadline timestamptz;
  v_created integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_to record;
  r record;
  v_req uuid;
  v_stage record;
  v_can_all boolean := public.has_permission('leads', 'reassign');
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to reassign leads.' using errcode = '42501';
  end if;
  if not (v_can_all or public.has_permission('leads', 'assign')) then
    raise exception 'You do not have permission to reassign leads.' using errcode = '42501';
  end if;
  if _mode is null or _mode not in ('start_over', 'continue') then
    raise exception 'Choose Start all over or Continue from the previous agent.' using errcode = '22023';
  end if;
  if _deadline_minutes is null or _deadline_minutes < 1 or _deadline_minutes > 43200 then
    raise exception 'The acceptance deadline must be between 1 minute and 30 days.' using errcode = '22023';
  end if;
  if coalesce(cardinality(_lead_ids), 0) = 0 then
    raise exception 'Select at least one lead.' using errcode = '22023';
  end if;
  if cardinality(_lead_ids) > 500 then
    raise exception 'Reassign at most 500 leads at a time.' using errcode = '22023';
  end if;

  select tm.id, tm.full_name, tm.permissions
    into v_to
    from public.team_members tm
   where tm.id = _to_agent_id and coalesce(tm.is_active, true) and tm.user_id is not null;
  if not found then
    raise exception 'That agent could not be found, or is no longer active.' using errcode = '22023';
  end if;
  if not (
    coalesce(v_to.permissions -> 'leads', '[]'::jsonb) ? 'view'
    or coalesce(v_to.permissions -> 'leads', '[]'::jsonb) ? 'view_team'
    or coalesce(v_to.permissions -> 'leads', '[]'::jsonb) ? 'view_all'
  ) then
    raise exception '% cannot work with leads, so a lead cannot be handed to them.', v_to.full_name using errcode = '22023';
  end if;

  v_deadline := now() + make_interval(mins => _deadline_minutes);

  for r in
    select l.id, l.full_name, l.pipeline_stage, l.assigned_agent_id
      from public.leads l
     where l.id = any (_lead_ids)
     order by l.id
       for update
  loop
    if not (v_can_all or public.can_access_lead(r.id)) then
      v_skipped := v_skipped || jsonb_build_object('lead_id', r.id, 'reason', 'You cannot access this lead.');
      continue;
    end if;
    if r.assigned_agent_id is not distinct from _to_agent_id then
      v_skipped := v_skipped || jsonb_build_object('lead_id', r.id, 'reason', 'Already with this agent.');
      continue;
    end if;
    if exists (select 1 from public.lead_reassignment_requests q where q.lead_id = r.id and q.status = 'pending') then
      v_skipped := v_skipped || jsonb_build_object('lead_id', r.id, 'reason', 'A handover request is already waiting for an answer.');
      continue;
    end if;
    select * into v_stage from public.pipeline_stage_info(r.pipeline_stage);
    if _mode = 'start_over' and found and v_stage.is_won then
      v_skipped := v_skipped || jsonb_build_object('lead_id', r.id, 'reason', 'A Won lead cannot be started over. Use Continue.');
      continue;
    end if;

    insert into public.lead_reassignment_requests
      (lead_id, lead_name, lead_stage, from_agent_id, to_agent_id, requested_by, mode, reason, deadline_at, batch_id)
    values
      (r.id, r.full_name, r.pipeline_stage, r.assigned_agent_id, _to_agent_id, v_me, _mode,
       left(nullif(btrim(coalesce(_reason, '')), ''), 500), v_deadline, v_batch)
    returning id into v_req;

    insert into public.assignment_events
      (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, request_id, mode)
    values
      ('lead', r.id, r.assigned_agent_id, _to_agent_id, auth.uid(), v_me, v_batch,
       left(nullif(btrim(coalesce(_reason, '')), ''), 500), 'requested', v_req, _mode);

    perform public.enqueue_staff_notification(
      _to_agent_id,
      'Lead handover request',
      r.full_name || ' - accept or decline before '
        || to_char(v_deadline at time zone 'Asia/Qatar', 'DD Mon, HH24:MI')
        || case when _mode = 'start_over' then ' (pipeline starts over)' else ' (continues from the previous agent)' end,
      '/overview',
      'lead_reassignment_request',
      'lead_reassignment_requests',
      v_req,
      'request'
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'requested', cardinality(_lead_ids),
    'created', v_created,
    'skipped', v_skipped,
    'deadline_at', v_deadline,
    'batch_id', v_batch
  );
end;
$$;

revoke all on function public.request_lead_reassignment(uuid[], uuid, text, integer, text) from public, anon;
grant execute on function public.request_lead_reassignment(uuid[], uuid, text, integer, text) to authenticated;

-- 6. Expire overdue requests (cron, and also run whenever someone responds) ------------------------------

create or replace function public.expire_due_lead_reassignments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.lead_reassignment_requests;
  n integer := 0;
  v_from text;
  v_to text;
begin
  for r in
    select * from public.lead_reassignment_requests
     where status = 'pending' and deadline_at <= now()
     order by deadline_at
       for update skip locked
  loop
    update public.lead_reassignment_requests
       set status = 'expired', resolved_at = now()
     where id = r.id
    returning * into r;

    insert into public.assignment_events
      (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, request_id, mode)
    values
      ('lead', r.lead_id, r.from_agent_id, r.to_agent_id, null, null, r.batch_id, 'No answer before the deadline', 'expired', r.id, r.mode);

    select full_name into v_from from public.team_members where id = r.from_agent_id;
    select full_name into v_to from public.team_members where id = r.to_agent_id;
    perform public._notify_reassignment_admins(
      r,
      'Handover not accepted in time',
      r.lead_name || ' was not accepted by ' || coalesce(v_to, 'the agent') || ' before the deadline. It stays with '
        || coalesce(v_from, 'the current agent') || '.',
      'expired'
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.expire_due_lead_reassignments() from public, anon;
grant execute on function public.expire_due_lead_reassignments() to authenticated, service_role;

-- 7. Accept or decline -------------------------------------------------------------------------------------

create or replace function public.respond_lead_reassignment(_request_id uuid, _accept boolean, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  req public.lead_reassignment_requests;
  v_lead public.leads;
  v_first text;
  v_to text;
  v_from text;
  v_note text := left(nullif(btrim(coalesce(_note, '')), ''), 500);
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to respond.' using errcode = '42501';
  end if;

  select * into req from public.lead_reassignment_requests where id = _request_id for update;
  if not found then
    raise exception 'That handover request could not be found.' using errcode = '22023';
  end if;
  if req.to_agent_id is distinct from v_me then
    raise exception 'Only the agent this lead was offered to can respond.' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('status', req.status, 'message', 'This request was already ' || req.status || '.');
  end if;

  if req.deadline_at <= now() then
    perform public.expire_due_lead_reassignments();
    return jsonb_build_object('status', 'expired', 'message', 'The deadline has passed, so this request has expired.');
  end if;

  select full_name into v_to from public.team_members where id = req.to_agent_id;
  select full_name into v_from from public.team_members where id = req.from_agent_id;

  if not _accept then
    update public.lead_reassignment_requests
       set status = 'rejected', resolved_at = now(), response_note = v_note
     where id = req.id
    returning * into req;

    insert into public.assignment_events
      (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, request_id, mode)
    values
      ('lead', req.lead_id, req.from_agent_id, req.to_agent_id, auth.uid(), v_me, req.batch_id, v_note, 'rejected', req.id, req.mode);

    perform public._notify_reassignment_admins(
      req,
      'Handover declined',
      coalesce(v_to, 'The agent') || ' declined ' || req.lead_name || '. It stays with ' || coalesce(v_from, 'the current agent') || '.'
        || coalesce(' Note: ' || v_note, ''),
      'rejected'
    );
    return jsonb_build_object('status', 'rejected');
  end if;

  -- Accept
  select * into v_lead from public.leads where id = req.lead_id for update;
  if not found or v_lead.assigned_agent_id is distinct from req.from_agent_id then
    update public.lead_reassignment_requests
       set status = 'cancelled', resolved_at = now(), response_note = 'The lead changed hands before this was answered.'
     where id = req.id;
    return jsonb_build_object('status', 'cancelled', 'message', 'This lead has changed hands since the request was sent, so the request was cancelled.');
  end if;

  perform set_config('app.lead_reassign_ok', req.lead_id::text, true);
  update public.leads set assigned_agent_id = req.to_agent_id where id = req.lead_id;

  if req.mode = 'start_over' then
    select s.stage_key into v_first
      from public.pipeline_stages s
     where s.is_active and not s.is_won and not s.is_lost
     order by s.position
     limit 1;
    if v_first is not null and v_lead.pipeline_stage is distinct from v_first then
      perform set_config('app.lead_stage_reset', req.lead_id::text, true);
      perform set_config('app.stage_change_kind', 'reassignment_reset', true);
      perform set_config('app.stage_change_reason', 'Handed over: the pipeline starts all over for the new agent', true);
      update public.leads set pipeline_stage = v_first where id = req.lead_id;
      perform set_config('app.lead_stage_reset', '', true);
      perform set_config('app.stage_change_kind', '', true);
      perform set_config('app.stage_change_reason', '', true);
    end if;
  end if;
  perform set_config('app.lead_reassign_ok', '', true);

  update public.lead_reassignment_requests
     set status = 'accepted', resolved_at = now(), response_note = v_note
   where id = req.id
  returning * into req;

  insert into public.assignment_events
    (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, request_id, mode)
  values
    ('lead', req.lead_id, req.from_agent_id, req.to_agent_id, auth.uid(), v_me, req.batch_id, v_note, 'accepted', req.id, req.mode),
    ('lead', req.lead_id, req.from_agent_id, req.to_agent_id, auth.uid(), v_me, req.batch_id, req.reason, 'reassigned', req.id, req.mode);

  perform public._notify_reassignment_admins(
    req,
    'Handover accepted',
    coalesce(v_to, 'The agent') || ' accepted ' || req.lead_name
      || case when req.mode = 'start_over' then ' and starts the pipeline over.' else ' and continues from the previous agent.' end,
    'accepted'
  );
  perform public.enqueue_staff_notification(
    req.from_agent_id,
    'Lead handed over',
    req.lead_name || ' is now with ' || coalesce(v_to, 'the new agent') || '.',
    '/leads',
    'lead_reassignment_result',
    'lead_reassignment_requests',
    req.id,
    'handed_over'
  );

  return jsonb_build_object('status', 'accepted', 'lead_id', req.lead_id, 'mode', req.mode);
end;
$$;

revoke all on function public.respond_lead_reassignment(uuid, boolean, text) from public, anon;
grant execute on function public.respond_lead_reassignment(uuid, boolean, text) to authenticated;

-- 8. Withdraw a request -----------------------------------------------------------------------------------

create or replace function public.cancel_lead_reassignment(_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  req public.lead_reassignment_requests;
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to cancel a request.' using errcode = '42501';
  end if;
  select * into req from public.lead_reassignment_requests where id = _request_id for update;
  if not found then
    raise exception 'That handover request could not be found.' using errcode = '22023';
  end if;
  if req.requested_by is distinct from v_me and not public.has_permission('leads', 'reassign') then
    raise exception 'Only the person who sent the request, or a Super Administrator, can cancel it.' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('status', req.status);
  end if;

  update public.lead_reassignment_requests
     set status = 'cancelled', resolved_at = now(), response_note = 'Withdrawn by the requester'
   where id = req.id
  returning * into req;

  insert into public.assignment_events
    (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, request_id, mode)
  values
    ('lead', req.lead_id, req.from_agent_id, req.to_agent_id, auth.uid(), v_me, req.batch_id, 'Withdrawn', 'cancelled', req.id, req.mode);

  perform public.enqueue_staff_notification(
    req.to_agent_id, 'Handover request withdrawn', req.lead_name || ' was withdrawn.', '/overview',
    'lead_reassignment_result', 'lead_reassignment_requests', req.id, 'cancelled'
  );
  return jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.cancel_lead_reassignment(uuid) from public, anon;
grant execute on function public.cancel_lead_reassignment(uuid) to authenticated;

-- 9. Other ways of changing a lead's agent now use the same flow ---------------------------------------------

-- Direct bulk reassignment is replaced by request_lead_reassignment (with the Start over / Continue choice
-- and the acceptance deadline).
create or replace function public.bulk_reassign_leads(_ids uuid[], _to_agent_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Leads are handed over with request_lead_reassignment, which asks the receiving agent to accept.'
    using errcode = '0A000';
end;
$$;

-- Deactivating a team member: their leads move at once (they are leaving, so there is nobody to
-- wait for), the mode is still chosen, and every lead gets a history row.
create or replace function public.reassign_member_leads(_from_agent_id uuid, _to_agent_id uuid, _mode text default 'continue')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_team_member_id();
  v_batch uuid := gen_random_uuid();
  v_first text;
  r record;
  n integer := 0;
begin
  if auth.uid() is null or v_me is null then
    raise exception 'Sign in to reassign leads.' using errcode = '42501';
  end if;
  if not (public.has_permission('team', 'manage') or public.is_super_administrator()) then
    raise exception 'You do not have permission to reassign a team member''s leads.' using errcode = '42501';
  end if;
  if _mode not in ('start_over', 'continue') then
    raise exception 'Choose Start all over or Continue from the previous agent.' using errcode = '22023';
  end if;
  if _from_agent_id is null or _to_agent_id is null or _from_agent_id = _to_agent_id then
    raise exception 'Choose a different receiving agent.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.team_members where id = _to_agent_id and coalesce(is_active, true)) then
    raise exception 'That agent could not be found, or is no longer active.' using errcode = '22023';
  end if;

  select s.stage_key into v_first
    from public.pipeline_stages s
   where s.is_active and not s.is_won and not s.is_lost
   order by s.position limit 1;

  for r in
    select l.id, l.pipeline_stage from public.leads l where l.assigned_agent_id = _from_agent_id order by l.id for update
  loop
    -- Any open handover request for this lead is superseded.
    update public.lead_reassignment_requests
       set status = 'cancelled', resolved_at = now(), response_note = 'Superseded: the previous agent left'
     where lead_id = r.id and status = 'pending';

    perform set_config('app.lead_reassign_ok', r.id::text, true);
    update public.leads set assigned_agent_id = _to_agent_id where id = r.id;
    perform set_config('app.lead_reassign_ok', '', true);

    if _mode = 'start_over' and v_first is not null and r.pipeline_stage is distinct from v_first
       and not coalesce((select is_won from public.pipeline_stage_info(r.pipeline_stage)), false) then
      perform set_config('app.lead_stage_reset', r.id::text, true);
      perform set_config('app.stage_change_kind', 'reassignment_reset', true);
      perform set_config('app.stage_change_reason', 'Handed over: the pipeline starts all over for the new agent', true);
      update public.leads set pipeline_stage = v_first where id = r.id;
      perform set_config('app.lead_stage_reset', '', true);
      perform set_config('app.stage_change_kind', '', true);
      perform set_config('app.stage_change_reason', '', true);
    end if;

    insert into public.assignment_events
      (entity_type, entity_id, from_agent_id, to_agent_id, actor_user_id, actor_team_member_id, batch_id, reason, event_type, mode)
    values
      ('lead', r.id, _from_agent_id, _to_agent_id, auth.uid(), v_me, v_batch, 'Previous agent left the team', 'reassigned', _mode);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.reassign_member_leads(uuid, uuid, text) from public, anon;
grant execute on function public.reassign_member_leads(uuid, uuid, text) to authenticated;

-- The older team-wide function must not touch leads any more (it would now be refused anyway).
-- Callers pass NULL for leads and use reassign_member_leads.

-- 10. Cron: expire overdue requests every minute ----------------------------------------------------------

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-lead-reassignments';
    perform cron.schedule('expire-lead-reassignments', '* * * * *', 'select public.expire_due_lead_reassignments()');
  end if;
end $$;
