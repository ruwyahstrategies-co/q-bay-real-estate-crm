-- Property Management: the pieces the module was missing to be usable
-- end to end (tenant identity, documents, maintenance, persisted overdue
-- state, duplicate-schedule protection).

-- ---------------------------------------------------------------- tenants --
alter table public.tenants
  add column if not exists id_number text,
  add column if not exists nationality text,
  add column if not exists is_demo boolean not null default false;

-- ---------------------------------------------------- documents / uploads --
-- Owner and property documents already route through uploads; tenants and
-- tenancy contracts had nowhere to hang, so files were unreachable from the
-- record they belong to.
alter table public.uploads
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists property_lease_id uuid references public.property_leases(id) on delete set null;

create index if not exists uploads_tenant_id_idx on public.uploads(tenant_id) where tenant_id is not null;
create index if not exists uploads_property_lease_id_idx on public.uploads(property_lease_id) where property_lease_id is not null;

-- ------------------------------------------------------- rent scheduling --
-- Generating a schedule twice used to silently double every installment.
delete from public.rent_schedule_items a
  using public.rent_schedule_items b
  where a.property_lease_id = b.property_lease_id
    and a.due_date = b.due_date
    and a.ctid > b.ctid
    and a.status = 'due'
    and not exists (select 1 from public.rent_payments p where p.rent_schedule_item_id = a.id);

create unique index if not exists rent_schedule_items_lease_due_uniq
  on public.rent_schedule_items(property_lease_id, due_date);

-- Overdue was only ever a UI calculation, so exports, totals and the
-- dashboard could disagree. Persist it instead.
create or replace function public.mark_overdue_rent_items()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  touched integer;
begin
  if not public.has_permission('properties', 'view') then
    raise exception 'insufficient permissions';
  end if;

  update public.rent_schedule_items
    set status = 'overdue'
    where status = 'due' and due_date < current_date;
  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.mark_overdue_rent_items() from public;
grant execute on function public.mark_overdue_rent_items() to authenticated;

-- --------------------------------------------------- maintenance / issues --
create table if not exists public.property_maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  property_lease_id uuid references public.property_leases(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'open',
  reported_by text not null default 'tenant',
  cost numeric,
  currency text not null default 'QAR',
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_maintenance_issues_category_check
    check (category in ('general', 'plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'cleaning', 'security')),
  constraint property_maintenance_issues_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint property_maintenance_issues_status_check
    check (status in ('open', 'in_progress', 'resolved', 'cancelled')),
  constraint property_maintenance_issues_reported_by_check
    check (reported_by in ('tenant', 'owner', 'staff', 'inspection'))
);

create index if not exists property_maintenance_issues_property_idx on public.property_maintenance_issues(property_id);
create index if not exists property_maintenance_issues_status_idx on public.property_maintenance_issues(status);

drop trigger if exists set_updated_at on public.property_maintenance_issues;
create trigger set_updated_at before update on public.property_maintenance_issues
  for each row execute function public.set_updated_at();

alter table public.property_maintenance_issues enable row level security;

drop policy if exists property_maintenance_issues_select on public.property_maintenance_issues;
create policy property_maintenance_issues_select on public.property_maintenance_issues
  for select using (public.has_permission('properties', 'view'));

drop policy if exists property_maintenance_issues_write on public.property_maintenance_issues;
create policy property_maintenance_issues_write on public.property_maintenance_issues
  for all using (public.has_permission('properties', 'edit'))
  with check (public.has_permission('properties', 'edit'));
