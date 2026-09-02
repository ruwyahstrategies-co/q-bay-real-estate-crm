-- Q-Bay Real Estate CRM — Owner Contract Generation (module B).
--
-- contract_templates: centrally replaceable body templates (the client's
-- real legal wording will be dropped in here later without touching code).
-- owner_contracts: one row per generated contract, snapshotting the
-- rendered document at generation time so later template edits never alter
-- history. Draft -> Generated -> Signed/Expired/Cancelled.

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null default 'rent' check (purpose in ('rent', 'sale', 'other')),
  body_html text not null default '',
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,
  purpose text not null default 'rent' check (purpose in ('rent', 'sale', 'other')),
  commission_rate numeric,
  commission_amount numeric,
  amount numeric,
  currency text default 'QAR',
  start_date date,
  end_date date,
  expiry_date date,
  terms text,
  status text not null default 'draft' check (status in ('draft', 'generated', 'signed', 'expired', 'cancelled')),
  generated_html text,
  signed_document_upload_id uuid references public.uploads(id) on delete set null,
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  generated_at timestamptz,
  signed_at timestamptz,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index owner_contracts_owner_id_idx on public.owner_contracts (owner_id);
create index owner_contracts_property_id_idx on public.owner_contracts (property_id);
create index owner_contracts_expiry_date_idx on public.owner_contracts (expiry_date) where expiry_date is not null;

drop trigger if exists set_updated_at on public.contract_templates;
create trigger set_updated_at before update on public.contract_templates for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.owner_contracts;
create trigger set_updated_at before update on public.owner_contracts for each row execute function public.set_updated_at();

alter table public.contract_templates enable row level security;
create policy contract_templates_select on public.contract_templates for select to authenticated using (public.has_permission('contracts', 'view'));
create policy contract_templates_write on public.contract_templates for all to authenticated
  using (public.has_permission('contracts', 'manage_templates')) with check (public.has_permission('contracts', 'manage_templates'));

alter table public.owner_contracts enable row level security;
create policy owner_contracts_select on public.owner_contracts for select to authenticated using (public.has_permission('contracts', 'view'));
create policy owner_contracts_insert on public.owner_contracts for insert to authenticated with check (public.has_permission('contracts', 'create'));
create policy owner_contracts_update on public.owner_contracts for update to authenticated
  using (public.has_permission('contracts', 'edit') or public.has_permission('contracts', 'generate'))
  with check (public.has_permission('contracts', 'edit') or public.has_permission('contracts', 'generate'));
create policy owner_contracts_delete on public.owner_contracts for delete to authenticated using (public.has_permission('contracts', 'delete'));

-- A starter, clearly-placeholder template per purpose so the generator has
-- something to render immediately. Replace body_html with the client's real
-- legal wording when supplied - nothing else needs to change.
insert into public.contract_templates (name, purpose, body_html, is_default) values
  ('Standard Rental Agreement (placeholder)', 'rent',
   '<h1>Property Rental Agreement</h1>
    <p><strong>DRAFT TEMPLATE - pending the client''s final legal wording.</strong></p>
    <p>This agreement is made between <strong>{{owner_name}}</strong> ("the Owner") and Q-Bay Real Estate acting on the Owner''s behalf, regarding the property <strong>{{property_title}}</strong> ({{property_reference}}).</p>
    <table>
      <tr><td>Rental amount</td><td>{{amount}} {{currency}}</td></tr>
      <tr><td>Commission rate</td><td>{{commission_rate}}%</td></tr>
      <tr><td>Term</td><td>{{start_date}} to {{end_date}}</td></tr>
    </table>
    <p>{{terms}}</p>',
   true),
  ('Standard Sale Agreement (placeholder)', 'sale',
   '<h1>Property Sale Agreement</h1>
    <p><strong>DRAFT TEMPLATE - pending the client''s final legal wording.</strong></p>
    <p>This agreement is made between <strong>{{owner_name}}</strong> ("the Owner") and Q-Bay Real Estate acting on the Owner''s behalf, regarding the property <strong>{{property_title}}</strong> ({{property_reference}}).</p>
    <table>
      <tr><td>Sale amount</td><td>{{amount}} {{currency}}</td></tr>
      <tr><td>Commission rate</td><td>{{commission_rate}}%</td></tr>
    </table>
    <p>{{terms}}</p>',
   true),
  ('General Agreement (placeholder)', 'other',
   '<h1>Agreement</h1>
    <p><strong>DRAFT TEMPLATE - pending the client''s final legal wording.</strong></p>
    <p>Between <strong>{{owner_name}}</strong> and Q-Bay Real Estate, regarding {{property_title}}.</p>
    <p>{{terms}}</p>',
   true);
