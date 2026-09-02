-- Q-Bay Real Estate CRM — Property Management module (module J).
--
-- Reuses what already exists rather than duplicating it: maintenance/issues
-- live on `tasks` (task_type='maintenance'), owner/tenant communication on
-- `interactions`, tenancy contracts on the existing property_leases.
-- contract_upload_id. New tables cover only what's genuinely missing:
-- a real Tenant entity, richer Tenancy fields, and Rent Schedule/Payments.

alter table public.properties add column if not exists is_managed boolean not null default false;
create index if not exists properties_is_managed_idx on public.properties (is_managed) where is_managed = true;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_leases add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.property_leases add column if not exists deposit_amount numeric;
alter table public.property_leases add column if not exists payment_frequency text default 'monthly' check (payment_frequency in ('monthly', 'quarterly', 'biannual', 'annual'));
alter table public.property_leases add column if not exists status text not null default 'active' check (status in ('pending', 'active', 'expired', 'terminated'));
alter table public.property_leases add column if not exists renewal_state text not null default 'not_due' check (renewal_state in ('not_due', 'pending_renewal', 'renewed', 'not_renewing'));
create index if not exists property_leases_tenant_id_idx on public.property_leases (tenant_id);
create index if not exists property_leases_lease_end_idx on public.property_leases (lease_end) where lease_end is not null;

create table public.rent_schedule_items (
  id uuid primary key default gen_random_uuid(),
  property_lease_id uuid not null references public.property_leases(id) on delete cascade,
  due_date date not null,
  amount numeric not null,
  currency text not null default 'QAR',
  status text not null default 'due' check (status in ('due', 'paid', 'partial', 'overdue')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rent_schedule_items_lease_id_idx on public.rent_schedule_items (property_lease_id);
create index rent_schedule_items_due_date_idx on public.rent_schedule_items (due_date);
create index rent_schedule_items_status_idx on public.rent_schedule_items (status);

create table public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  property_lease_id uuid not null references public.property_leases(id) on delete cascade,
  rent_schedule_item_id uuid references public.rent_schedule_items(id) on delete set null,
  received_date date not null default current_date,
  amount numeric not null,
  currency text not null default 'QAR',
  method text,
  status text not null default 'received' check (status in ('received', 'pending', 'failed')),
  notes text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index rent_payments_lease_id_idx on public.rent_payments (property_lease_id);
create index rent_payments_schedule_item_id_idx on public.rent_payments (rent_schedule_item_id);

-- Communication can now be logged against a tenant too (mirrors owner_id added earlier).
alter table public.interactions add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
create index if not exists interactions_tenant_id_idx on public.interactions (tenant_id);

drop trigger if exists set_updated_at on public.tenants;
create trigger set_updated_at before update on public.tenants for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.rent_schedule_items;
create trigger set_updated_at before update on public.rent_schedule_items for each row execute function public.set_updated_at();

-- A received/failed payment updates its schedule item's status automatically.
create or replace function public.rent_payments_update_schedule_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sched record;
  paid_total numeric;
begin
  if new.rent_schedule_item_id is null or new.status <> 'received' then
    return new;
  end if;
  select * into sched from public.rent_schedule_items where id = new.rent_schedule_item_id;
  if sched is null then return new; end if;

  select coalesce(sum(amount), 0) into paid_total
    from public.rent_payments
    where rent_schedule_item_id = sched.id and status = 'received';

  update public.rent_schedule_items
    set status = case
      when paid_total >= sched.amount then 'paid'
      when paid_total > 0 then 'partial'
      else status
    end
    where id = sched.id;

  return new;
end;
$$;

revoke execute on function public.rent_payments_update_schedule_status() from public, anon, authenticated;

drop trigger if exists rent_payments_update_schedule_status on public.rent_payments;
create trigger rent_payments_update_schedule_status
  after insert on public.rent_payments
  for each row execute function public.rent_payments_update_schedule_status();

-- =============================================================================
-- RLS — reuses the 'properties' module permission (a tenancy/rent record is
-- always scoped under a property the caller can already see/edit).
-- =============================================================================

alter table public.tenants enable row level security;
create policy tenants_select on public.tenants for select to authenticated using (public.has_permission('properties', 'view'));
create policy tenants_insert on public.tenants for insert to authenticated with check (public.has_permission('properties', 'edit'));
create policy tenants_update on public.tenants for update to authenticated
  using (public.has_permission('properties', 'edit')) with check (public.has_permission('properties', 'edit'));
create policy tenants_delete on public.tenants for delete to authenticated using (public.has_permission('properties', 'delete'));

alter table public.rent_schedule_items enable row level security;
create policy rent_schedule_items_select on public.rent_schedule_items for select to authenticated using (public.has_permission('properties', 'view'));
create policy rent_schedule_items_write on public.rent_schedule_items for all to authenticated
  using (public.has_permission('properties', 'edit')) with check (public.has_permission('properties', 'edit'));

alter table public.rent_payments enable row level security;
create policy rent_payments_select on public.rent_payments for select to authenticated using (public.has_permission('properties', 'view'));
create policy rent_payments_write on public.rent_payments for all to authenticated
  using (public.has_permission('properties', 'edit')) with check (public.has_permission('properties', 'edit'));
