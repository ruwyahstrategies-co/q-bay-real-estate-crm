-- Staff isolation for owners, and for properties that are not approved yet.
--
-- Before this, every staff member with the "view owners" permission (every sales agent) could list all owners
-- of the company with their names, companies, emails, notes and addresses, and read the tasks, conversations
-- and contracts attached to any owner. Any staff member could also open another agent's properties that were
-- still waiting for approval. Now:
--
--   Owners: a developer record is visible to everyone who can view owners (agents choose a developer when they
--     add a development or property). Any other owner is visible to the same people who may see that owner's
--     phone number (Super Administrators, Administrators, anyone with the owner-phone permission, and the agent
--     the owner is assigned to or who works with that owner), and to the staff member who created the record.
--   Owner tasks, owner conversations and owner contracts follow the owner: if you cannot see the owner you
--     cannot see what is attached to them.
--   Properties: approved properties stay visible to all staff (the shared inventory). A property that is still
--     pending, rejected or has changes requested is visible to its submitter, its assigned agent, its creator
--     and to people who approve properties.
--
-- No row is changed. Only who can read it.

alter table public.owners
  add column if not exists created_by uuid default auth.uid();

-- Read access on the one new column, so the row rule below can use it. It holds only a user id.
grant select (created_by) on public.owners to authenticated;

alter policy owners_select on public.owners
  using (
    public.has_permission('owners', 'view')
    and (
      is_developer is true
      or created_by = auth.uid()
      or public.can_view_owner_phone(id)
    )
  );

alter policy tasks_select on public.tasks
  using (
    public.has_permission('tasks', 'view_all')
    or created_by = auth.uid()
    or (owner_id is not null and exists (select 1 from public.owners o where o.id = tasks.owner_id))
    or (
      public.has_permission('tasks', 'view_team')
      and exists (select 1 from public.team_members tm where tm.id = tasks.assigned_to and tm.team_id = public.current_team_id())
    )
    or (public.has_permission('tasks', 'view') and assigned_to = public.current_team_member_id())
  );

alter policy interactions_select on public.interactions
  using (
    public.has_permission('conversations', 'view_all')
    or created_by = auth.uid()
    or (owner_id is not null and exists (select 1 from public.owners o where o.id = interactions.owner_id))
    or exists (
      select 1 from public.leads l
       where l.id = interactions.lead_id
         and (
           (public.has_permission('conversations', 'view_team') and l.team_id = public.current_team_id())
           or (public.has_permission('conversations', 'view') and l.assigned_agent_id = public.current_team_member_id())
         )
    )
  );

alter policy owner_contracts_select on public.owner_contracts
  using (
    public.has_permission('contracts', 'view')
    and exists (select 1 from public.owners o where o.id = owner_contracts.owner_id)
  );

alter policy properties_select_staff on public.properties
  using (
    public.has_permission('properties', 'view')
    and (
      approval_status = 'approved'
      or public.has_permission('properties', 'approve')
      or submitted_by = public.current_team_member_id()
      or assigned_agent_id = public.current_team_member_id()
      or created_by = auth.uid()
      or created_by = public.current_team_member_id()
    )
  );

-- A clearer message when a phone number is already taken by an owner the person cannot open.
create or replace function public.owners_enforce_unique_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.owner_phone_key(new.phone);
begin
  if tg_op = 'UPDATE' and v_key is not distinct from public.owner_phone_key(old.phone) then
    return new;
  end if;

  -- A new number starts a clean slate for the legacy flag.
  new.phone_duplicate_acknowledged := false;
  if v_key is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('owner_phone_' || v_key));

  if exists (
    select 1 from public.owners o
     where o.id is distinct from new.id
       and public.owner_phone_key(o.phone) = v_key
  ) then
    raise exception 'An owner with this phone number already exists. If you cannot see them in your list, ask an administrator to assign that owner to you.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;
