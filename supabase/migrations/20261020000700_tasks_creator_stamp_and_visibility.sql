-- Tasks: remember who created them, and let the creator see what they created.
--
-- Until now a task never recorded its creator (created_by was always empty). Under the task visibility rules
-- an agent with plain "view" only reads tasks assigned to them, so a task they created and left unassigned
-- (or assigned to a colleague) disappeared from their own list the moment it was saved. The creator is now
-- stamped on insert and may always read their own tasks. Nothing is widened beyond that.

create or replace function public.tasks_stamp_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace trigger tasks_stamp_creator
  before insert on public.tasks
  for each row execute function public.tasks_stamp_creator();

alter policy tasks_select on public.tasks
  using (
    public.has_permission('tasks', 'view_all')
    or created_by = auth.uid()
    or ((owner_id is not null) and public.has_permission('owners', 'view'))
    or (public.has_permission('tasks', 'view_team') and exists (
          select 1 from public.team_members tm
           where tm.id = tasks.assigned_to and tm.team_id = public.current_team_id()))
    or (public.has_permission('tasks', 'view') and assigned_to = public.current_team_member_id())
  );

create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_due_at_idx on public.tasks (due_at);
