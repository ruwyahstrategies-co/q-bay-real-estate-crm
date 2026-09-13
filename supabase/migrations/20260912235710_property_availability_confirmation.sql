-- Recurring availability verification workflow. Cadence is configured once in
-- app_settings (key 'availability_confirmation') rather than per-property, so
-- Settings remains the single source of truth for the reminder interval.
alter table public.properties
  add column if not exists availability_last_confirmed_at timestamptz,
  add column if not exists availability_confirmed_by uuid references public.team_members(id) on delete set null,
  add column if not exists availability_next_due_at timestamptz;

create table if not exists public.property_availability_confirmations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.team_members(id) on delete set null,
  response text check (response is null or response = any (array['available','sold','rented','reserved','unavailable']::text[])),
  notes text,
  owner_notified_at timestamptz,
  owner_notification_channel text,
  created_at timestamptz not null default now()
);
create index if not exists property_availability_confirmations_property_id_idx on public.property_availability_confirmations(property_id);
create index if not exists property_availability_confirmations_pending_idx on public.property_availability_confirmations(property_id) where responded_at is null;

alter table public.property_availability_confirmations enable row level security;

drop policy if exists property_availability_confirmations_select on public.property_availability_confirmations;
create policy property_availability_confirmations_select on public.property_availability_confirmations
  for select to authenticated using (public.has_permission('properties','view'));

drop policy if exists property_availability_confirmations_insert on public.property_availability_confirmations;
create policy property_availability_confirmations_insert on public.property_availability_confirmations
  for insert to authenticated with check (public.has_permission('properties','edit'));

drop policy if exists property_availability_confirmations_update on public.property_availability_confirmations;
create policy property_availability_confirmations_update on public.property_availability_confirmations
  for update to authenticated using (public.has_permission('properties','edit')) with check (public.has_permission('properties','edit'));

insert into public.app_settings (organisation_id, setting_key, setting_value)
select o.id, 'availability_confirmation', jsonb_build_object('cadence_days', 30)
from public.organisations o
where not exists (
  select 1 from public.app_settings s where s.organisation_id = o.id and s.setting_key = 'availability_confirmation'
);
