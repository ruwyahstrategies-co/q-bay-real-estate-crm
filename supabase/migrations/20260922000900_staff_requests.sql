-- Internal Requests: a simple place for agents to send a request to management.
--
-- Separate from marketing_requests, which is property-specific (one row per property missing
-- photos) and cannot hold a generic request.
--
-- Permission module "requests" (stored in team_members.permissions like every other module):
--   view       see requests you sent, or that are assigned to you
--   view_team  also see every request sent by your team
--   view_all   see every request
--   create     send a request
--   manage     assign, change status and respond (within the scope you can see)
-- All of it is enforced here with row level security plus guard triggers, not in the UI.

create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.team_members(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  category text not null default 'general',
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'submitted',
  assigned_to uuid references public.team_members(id) on delete set null,
  response_notes text,
  resolved_at timestamptz,
  resolved_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_requests_category_check
    check (category in ('general', 'property', 'lead', 'marketing', 'documents', 'technical', 'administration')),
  constraint staff_requests_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint staff_requests_status_check
    check (status in ('submitted', 'in_review', 'in_progress', 'completed', 'closed')),
  constraint staff_requests_title_check
    check (char_length(btrim(title)) between 3 and 200)
);

create index if not exists staff_requests_requested_by_idx on public.staff_requests (requested_by);
create index if not exists staff_requests_team_id_idx on public.staff_requests (team_id);
create index if not exists staff_requests_assigned_to_idx on public.staff_requests (assigned_to);
create index if not exists staff_requests_status_idx on public.staff_requests (status);
create index if not exists staff_requests_created_at_idx on public.staff_requests (created_at desc);

drop trigger if exists set_updated_at on public.staff_requests;
create trigger set_updated_at before update on public.staff_requests
  for each row execute function public.set_updated_at();

-- Can the caller manage (assign / change status / respond to) a request in this scope?
create or replace function public.staff_requests_can_manage(_team_id uuid, _assigned_to uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and public.has_permission('requests', 'manage')
     and (
       public.has_permission('requests', 'view_all')
       or (
         public.has_permission('requests', 'view_team')
         and _team_id is not null
         and _team_id = public.current_team_id()
       )
       or (_assigned_to is not null and _assigned_to = public.current_team_member_id())
     );
$$;

revoke all on function public.staff_requests_can_manage(uuid, uuid) from public, anon;
grant execute on function public.staff_requests_can_manage(uuid, uuid) to authenticated;

alter table public.staff_requests enable row level security;

drop policy if exists staff_requests_select on public.staff_requests;
create policy staff_requests_select on public.staff_requests
  for select to authenticated
  using (
    (
      public.has_permission('requests', 'view')
      and (
        requested_by = public.current_team_member_id()
        or assigned_to = public.current_team_member_id()
      )
    )
    or public.has_permission('requests', 'view_all')
    or (
      public.has_permission('requests', 'view_team')
      and team_id is not null
      and team_id = public.current_team_id()
    )
  );

drop policy if exists staff_requests_insert on public.staff_requests;
create policy staff_requests_insert on public.staff_requests
  for insert to authenticated
  with check (
    public.has_permission('requests', 'create')
    and requested_by = public.current_team_member_id()
  );

drop policy if exists staff_requests_update on public.staff_requests;
create policy staff_requests_update on public.staff_requests
  for update to authenticated
  using (
    (
      requested_by = public.current_team_member_id()
      and status = 'submitted'
      and public.has_permission('requests', 'create')
    )
    or public.staff_requests_can_manage(team_id, assigned_to)
  )
  with check (
    (
      requested_by = public.current_team_member_id()
      and public.has_permission('requests', 'create')
    )
    or public.staff_requests_can_manage(team_id, assigned_to)
  );

-- No delete policy: requests are a record and are closed, not deleted.

-- Insert guard: the requester and their team are always taken from the signed-in user, and a
-- request always starts as Submitted. Only managers may pre-assign or pre-answer.
create or replace function public.staff_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid;
  v_manager boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_me := public.current_team_member_id();
  v_manager := public.has_permission('requests', 'manage');

  new.requested_by := v_me;
  select tm.team_id into new.team_id from public.team_members tm where tm.id = v_me;
  new.status := 'submitted';
  new.resolved_at := null;
  new.resolved_by := null;
  if not v_manager then
    new.assigned_to := null;
    new.response_notes := null;
  end if;
  return new;
end;
$$;

revoke all on function public.staff_requests_before_insert() from public, anon, authenticated;

drop trigger if exists staff_requests_before_insert on public.staff_requests;
create trigger staff_requests_before_insert
  before insert on public.staff_requests
  for each row execute function public.staff_requests_before_insert();

-- Update guard: RLS decides which rows a caller can touch, this decides which columns.
--   Managers: status, assignment, response. Never who asked, their team or the created date.
--   Requesters (own request, still Submitted): title, description, category, priority, or
--   withdraw it (status Closed). Nothing else.
create or replace function public.staff_requests_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid;
  v_manager boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_me := public.current_team_member_id();
  v_manager := public.staff_requests_can_manage(old.team_id, old.assigned_to);

  new.requested_by := old.requested_by;
  new.team_id := old.team_id;
  new.created_at := old.created_at;

  if not v_manager then
    if old.requested_by is distinct from v_me or old.status <> 'submitted' then
      raise exception 'You can only change your own request while it is still Submitted'
        using errcode = '42501';
    end if;
    if new.assigned_to is distinct from old.assigned_to
       or new.response_notes is distinct from old.response_notes
       or new.resolved_at is distinct from old.resolved_at
       or new.resolved_by is distinct from old.resolved_by then
      raise exception 'Only a manager can assign or respond to a request' using errcode = '42501';
    end if;
    if new.status not in ('submitted', 'closed') then
      raise exception 'You can only withdraw your own request' using errcode = '42501';
    end if;
  end if;

  if new.status in ('completed', 'closed') then
    if old.status not in ('completed', 'closed') then
      new.resolved_at := now();
      new.resolved_by := v_me;
    end if;
  else
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.staff_requests_before_update() from public, anon, authenticated;

drop trigger if exists staff_requests_before_update on public.staff_requests;
create trigger staff_requests_before_update
  before update on public.staff_requests
  for each row execute function public.staff_requests_before_update();

-- Notifications (uses the existing staff notification inbox): managers who can see a new
-- request, the assignee when assigned, and the requester when the status changes.
create or replace function public.staff_requests_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_label text;
begin
  if tg_op = 'INSERT' then
    for r in
      select tm.id
        from public.team_members tm
       where tm.is_active is true
         and coalesce(tm.permissions -> 'requests', '[]'::jsonb) ? 'manage'
         and (
           (tm.permissions -> 'requests') ? 'view_all'
           or (
             (tm.permissions -> 'requests') ? 'view_team'
             and tm.team_id is not null
             and tm.team_id = new.team_id
           )
         )
         and tm.id is distinct from new.requested_by
    loop
      perform public.enqueue_staff_notification(
        r.id, 'New request', new.title, '/requests', 'staff_request',
        'staff_requests', new.id, 'new'
      );
    end loop;
    return new;
  end if;

  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    perform public.enqueue_staff_notification(
      new.assigned_to, 'Request assigned to you', new.title, '/requests', 'staff_request',
      'staff_requests', new.id, 'assigned:' || new.assigned_to::text
    );
  end if;

  if new.status is distinct from old.status and new.requested_by is not null then
    v_label := case new.status
      when 'in_review' then 'In review'
      when 'in_progress' then 'In progress'
      when 'completed' then 'Completed'
      when 'closed' then 'Closed'
      else 'Submitted'
    end;
    perform public.enqueue_staff_notification(
      new.requested_by, 'Your request is now: ' || v_label, new.title, '/requests',
      'staff_request', 'staff_requests', new.id, 'status:' || new.status
    );
  end if;
  return new;
end;
$$;

revoke all on function public.staff_requests_notify() from public, anon, authenticated;

drop trigger if exists staff_requests_notify on public.staff_requests;
create trigger staff_requests_notify
  after insert or update of assigned_to, status on public.staff_requests
  for each row execute function public.staff_requests_notify();

-- Give every existing staff member the permission that matches their role, without touching
-- anything else they hold. Runs once; members who already have a requests entry are skipped.
update public.team_members tm
   set permissions = coalesce(tm.permissions, '{}'::jsonb) || jsonb_build_object(
     'requests',
     case tm.role
       when 'super_administrator' then '["view","view_team","view_all","create","manage"]'::jsonb
       when 'administrator' then '["view","view_team","view_all","create","manage"]'::jsonb
       when 'sales_manager' then '["view","view_all","create","manage"]'::jsonb
       when 'team_leader' then '["view","view_team","create","manage"]'::jsonb
       when 'viewer' then '["view"]'::jsonb
       else '["view","create"]'::jsonb
     end
   )
 where not (coalesce(tm.permissions, '{}'::jsonb) ? 'requests');
