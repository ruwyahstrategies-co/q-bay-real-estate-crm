-- CRM record of a property being shared with a lead. This is deliberately NOT
-- lead_property_interests: sharing a property does not mean the lead is
-- interested. status is honest about delivery:
--   recorded : saved in the CRM only, nothing was delivered externally
--   sent     : delivered through a working external provider (message id kept)
--   failed   : an external send was attempted and failed (error kept)

create table if not exists public.property_shares (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  shared_by uuid references public.team_members(id) on delete set null default public.current_team_member_id(),
  share_batch_id uuid not null,
  channel text not null default 'crm',
  status text not null default 'recorded',
  message text,
  external_message_id text,
  delivery_error text,
  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint property_shares_channel_check check (channel in ('crm', 'whatsapp')),
  constraint property_shares_status_check check (status in ('recorded', 'sent', 'failed'))
);

-- One row per lead per share action. A double click reuses the same batch id
-- client-side, so the second insert is ignored instead of duplicating.
create unique index if not exists property_shares_batch_lead_key
  on public.property_shares (share_batch_id, lead_id);
create index if not exists property_shares_property_idx
  on public.property_shares (property_id, shared_at desc);
create index if not exists property_shares_lead_idx
  on public.property_shares (lead_id, shared_at desc);
create index if not exists property_shares_shared_by_idx
  on public.property_shares (shared_by);

alter table public.property_shares enable row level security;

-- Visible to anyone who can see the lead (same tiers as lead_property_interests).
drop policy if exists property_shares_select on public.property_shares;
create policy property_shares_select on public.property_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
       where l.id = property_shares.lead_id
         and (
           has_permission('leads', 'view_all')
           or (has_permission('leads', 'view_team') and l.team_id = current_team_id())
           or (has_permission('leads', 'view') and l.assigned_agent_id = current_team_member_id())
         )
    )
  );

-- Staff record shares as themselves, only for properties they can view and
-- leads they can see.
drop policy if exists property_shares_insert on public.property_shares;
create policy property_shares_insert on public.property_shares
  for insert to authenticated
  with check (
    shared_by = current_team_member_id()
    and has_permission('properties', 'view')
    and exists (
      select 1 from public.leads l
       where l.id = property_shares.lead_id
         and (
           has_permission('leads', 'view_all')
           or (has_permission('leads', 'view_team') and l.team_id = current_team_id())
           or (has_permission('leads', 'view') and l.assigned_agent_id = current_team_member_id())
         )
    )
  );

-- The sharer can update delivery status/result of their own share. No delete
-- policy: this is an audit trail (rows only go away with the property or lead).
drop policy if exists property_shares_update_own on public.property_shares;
create policy property_shares_update_own on public.property_shares
  for update to authenticated
  using (shared_by = current_team_member_id())
  with check (shared_by = current_team_member_id());
