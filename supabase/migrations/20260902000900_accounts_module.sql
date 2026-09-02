-- Q-Bay Real Estate CRM — Expanded Accounts module (module G).
-- Operational accounting only, built on top of the existing transactions
-- table rather than replacing it: invoices formalize what's receivable
-- (from an owner/client) or payable (commission/expense owed out), with
-- line items and a payment ledger. Uses the existing 'accounting'
-- permission - no new module needed.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text,
  type text not null default 'receivable' check (type in ('receivable', 'payable')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),
  owner_id uuid references public.owners(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  agent_id uuid references public.team_members(id) on delete set null,
  amount numeric not null default 0,
  currency text not null default 'QAR',
  issued_date date not null default current_date,
  due_date date,
  notes text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount numeric not null,
  currency text not null default 'QAR',
  method text,
  status text not null default 'received' check (status in ('received', 'pending', 'failed')),
  received_date date not null default current_date,
  notes text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index invoices_type_idx on public.invoices (type);
create index invoices_status_idx on public.invoices (status);
create index invoices_owner_id_idx on public.invoices (owner_id);
create index invoices_due_date_idx on public.invoices (due_date) where due_date is not null;
create index invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);
create index payments_invoice_id_idx on public.payments (invoice_id);
create index payments_transaction_id_idx on public.payments (transaction_id);

drop trigger if exists set_updated_at on public.invoices;
create trigger set_updated_at before update on public.invoices for each row execute function public.set_updated_at();

-- A received payment against an invoice recomputes that invoice's status
-- from what's actually been paid (paid/partial), same pattern as rent schedules.
create or replace function public.payments_update_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  paid_total numeric;
begin
  if new.invoice_id is null or new.status <> 'received' then
    return new;
  end if;
  select * into inv from public.invoices where id = new.invoice_id;
  if inv is null then return new; end if;

  select coalesce(sum(amount), 0) into paid_total
    from public.payments
    where invoice_id = inv.id and status = 'received';

  update public.invoices
    set status = case
      when paid_total >= inv.amount and inv.amount > 0 then 'paid'
      when paid_total > 0 then 'partial'
      else status
    end
    where id = inv.id;

  return new;
end;
$$;

revoke execute on function public.payments_update_invoice_status() from public, anon, authenticated;

drop trigger if exists payments_update_invoice_status on public.payments;
create trigger payments_update_invoice_status
  after insert on public.payments
  for each row execute function public.payments_update_invoice_status();

alter table public.invoices enable row level security;
create policy invoices_select on public.invoices for select to authenticated using (public.has_permission('accounting', 'view'));
create policy invoices_write on public.invoices for all to authenticated
  using (public.has_permission('accounting', 'manage')) with check (public.has_permission('accounting', 'manage'));

alter table public.invoice_line_items enable row level security;
create policy invoice_line_items_select on public.invoice_line_items for select to authenticated using (public.has_permission('accounting', 'view'));
create policy invoice_line_items_write on public.invoice_line_items for all to authenticated
  using (public.has_permission('accounting', 'manage')) with check (public.has_permission('accounting', 'manage'));

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated using (public.has_permission('accounting', 'view'));
create policy payments_write on public.payments for all to authenticated
  using (public.has_permission('accounting', 'manage')) with check (public.has_permission('accounting', 'manage'));
