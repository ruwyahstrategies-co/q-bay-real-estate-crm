-- Reusable, database-backed permission presets. A preset is a TEMPLATE only:
-- applying it copies its permissions onto a team member's own
-- team_members.permissions, which remains the authoritative value that
-- public.has_permission() reads. Editing or deleting a preset never changes
-- any existing team member.

create table if not exists public.permission_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid references public.team_members(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_presets_name_not_blank check (length(btrim(name)) > 0),
  constraint permission_presets_permissions_is_object check (jsonb_typeof(permissions) = 'object')
);

-- Case-insensitive, whitespace-trimmed unique name so "Senior Sales Agent" and
-- " senior sales agent " cannot both exist.
create unique index if not exists permission_presets_name_key
  on public.permission_presets (lower(btrim(name)));

drop trigger if exists permission_presets_set_updated_at on public.permission_presets;
create trigger permission_presets_set_updated_at
  before update on public.permission_presets
  for each row execute function public.set_updated_at();

alter table public.permission_presets enable row level security;

-- Anyone who can view or manage the team (or settings) can read presets so the
-- team-member drawer can list them.
drop policy if exists permission_presets_select on public.permission_presets;
create policy permission_presets_select on public.permission_presets
  for select to authenticated
  using (
    has_permission('team', 'view')
    or has_permission('team', 'manage')
    or has_permission('settings', 'manage')
  );

drop policy if exists permission_presets_insert on public.permission_presets;
create policy permission_presets_insert on public.permission_presets
  for insert to authenticated
  with check (
    (has_permission('team', 'manage') or has_permission('settings', 'manage'))
    and is_system = false
  );

drop policy if exists permission_presets_update on public.permission_presets;
create policy permission_presets_update on public.permission_presets
  for update to authenticated
  using (
    (has_permission('team', 'manage') or has_permission('settings', 'manage'))
    and is_system = false
  )
  with check (
    (has_permission('team', 'manage') or has_permission('settings', 'manage'))
    and is_system = false
  );

drop policy if exists permission_presets_delete on public.permission_presets;
create policy permission_presets_delete on public.permission_presets
  for delete to authenticated
  using (
    (has_permission('team', 'manage') or has_permission('settings', 'manage'))
    and is_system = false
  );
