-- In-app + browser notification inbox for authenticated Q-Bay staff.
-- This is separate from scheduled_notifications, which is the outbound SMS
-- reminder pipeline for owners/clients.

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_member_id uuid references public.team_members(id) on delete cascade,
  title text not null,
  body text,
  href text,
  kind text not null default 'general',
  related_table text,
  related_id uuid,
  event_key text not null default 'general',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_notifications_user_created_idx
  on public.staff_notifications (user_id, created_at desc);
create index if not exists staff_notifications_user_unread_idx
  on public.staff_notifications (user_id, read_at)
  where read_at is null;

create unique index if not exists staff_notifications_event_dedupe
  on public.staff_notifications (user_id, related_table, related_id, event_key)
  where related_table is not null and related_id is not null;

alter table public.staff_notifications enable row level security;

drop policy if exists staff_notifications_select_own on public.staff_notifications;
create policy staff_notifications_select_own
  on public.staff_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists staff_notifications_update_own on public.staff_notifications;
create policy staff_notifications_update_own
  on public.staff_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No direct client INSERT/DELETE policy: notifications are created by
-- trusted database triggers/server-side code, not spoofed by the browser.

create or replace function public.enqueue_staff_notification(
  p_team_member_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_kind text,
  p_related_table text,
  p_related_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_team_member_id is null then
    return;
  end if;

  select tm.user_id
    into v_user_id
    from public.team_members tm
   where tm.id = p_team_member_id
     and coalesce(tm.is_active, true) = true;

  if v_user_id is null then
    return;
  end if;

  insert into public.staff_notifications (
    user_id,
    team_member_id,
    title,
    body,
    href,
    kind,
    related_table,
    related_id,
    event_key
  ) values (
    v_user_id,
    p_team_member_id,
    p_title,
    p_body,
    p_href,
    coalesce(p_kind, 'general'),
    p_related_table,
    p_related_id,
    coalesce(p_event_key, 'general')
  )
  on conflict (user_id, related_table, related_id, event_key)
    where related_table is not null and related_id is not null
  do nothing;
end;
$$;

revoke all on function public.enqueue_staff_notification(uuid,text,text,text,text,text,uuid,text) from public, anon, authenticated;

create or replace function public.notify_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_agent_id is not null
     and (
       tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and new.assigned_agent_id is distinct from old.assigned_agent_id)
     ) then
    perform public.enqueue_staff_notification(
      new.assigned_agent_id,
      'Lead assigned to you',
      new.full_name,
      '/leads/' || new.id::text,
      'lead_assignment',
      'leads',
      new.id,
      'assigned:' || new.assigned_agent_id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_lead_assignment() from public, anon, authenticated;
drop trigger if exists notify_lead_assignment on public.leads;
create trigger notify_lead_assignment
  after insert or update of assigned_agent_id on public.leads
  for each row execute function public.notify_lead_assignment();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due text;
begin
  if new.assigned_to is not null
     and (
       tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to)
     ) then
    v_due := case
      when new.due_at is null then null
      else 'Due ' || to_char(new.due_at at time zone 'Asia/Qatar', 'DD Mon YYYY, HH24:MI')
    end;

    perform public.enqueue_staff_notification(
      new.assigned_to,
      'Task assigned to you',
      concat_ws(' · ', new.title, v_due),
      '/calendar',
      'task_assignment',
      'tasks',
      new.id,
      'assigned:' || new.assigned_to::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_task_assignment() from public, anon, authenticated;
drop trigger if exists notify_task_assignment on public.tasks;
create trigger notify_task_assignment
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assignment();

create or replace function public.notify_viewing_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_name text;
  v_property_title text;
  v_body text;
begin
  if new.assigned_agent_id is not null
     and (
       tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and new.assigned_agent_id is distinct from old.assigned_agent_id)
     ) then

    select full_name into v_lead_name from public.leads where id = new.lead_id;
    select title into v_property_title from public.properties where id = new.property_id;

    v_body := concat_ws(
      ' · ',
      coalesce(v_lead_name, 'Lead'),
      coalesce(v_property_title, 'Property'),
      to_char(new.scheduled_at at time zone 'Asia/Qatar', 'DD Mon YYYY, HH24:MI')
    );

    perform public.enqueue_staff_notification(
      new.assigned_agent_id,
      'Viewing assigned to you',
      v_body,
      '/viewings',
      'viewing_assignment',
      'viewings',
      new.id,
      'assigned:' || new.assigned_agent_id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_viewing_assignment() from public, anon, authenticated;
drop trigger if exists notify_viewing_assignment on public.viewings;
create trigger notify_viewing_assignment
  after insert or update of assigned_agent_id on public.viewings
  for each row execute function public.notify_viewing_assignment();

-- Ensure INSERT events are available to the authenticated CRM realtime
-- subscription used by the notification bell.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'staff_notifications'
  ) then
    alter publication supabase_realtime add table public.staff_notifications;
  end if;
end $$;
