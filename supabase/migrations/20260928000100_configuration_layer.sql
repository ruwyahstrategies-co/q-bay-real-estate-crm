-- Dynamic configuration layer: Channels/Lead Sources, Lead & Unit custom
-- field definitions, and a color tag on pipeline stages. Additive only -
-- no existing table is dropped, renamed or has data rewritten here (data
-- cleanup for locations is a separate migration).

-- =============================================================================
-- 1. lead_channels: replaces the free-text "Lead source" input with a
--    managed list. leads.lead_source itself stays a plain text column -
--    nothing here rewrites it, so every historical value (typed by hand or
--    imported) keeps working unchanged. This table only powers the picker.
-- =============================================================================

create table if not exists public.lead_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_channels_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists lead_channels_name_key on public.lead_channels (lower(btrim(name)));
create index if not exists lead_channels_order_idx on public.lead_channels (display_order);

drop trigger if exists lead_channels_set_updated_at on public.lead_channels;
create trigger lead_channels_set_updated_at
  before update on public.lead_channels
  for each row execute function public.set_updated_at();

alter table public.lead_channels enable row level security;

drop policy if exists lead_channels_select on public.lead_channels;
create policy lead_channels_select on public.lead_channels for select to authenticated using (true);

drop policy if exists lead_channels_write on public.lead_channels;
create policy lead_channels_write on public.lead_channels for all to authenticated
  using (public.has_permission('settings', 'manage'))
  with check (public.has_permission('settings', 'manage'));

-- Seed with the channels the client referenced, plus the two industry
-- portals they named by their local spelling. Only runs once (empty table).
insert into public.lead_channels (name, code, display_order, is_active)
select * from (values
  ('Website', 'website', 0, true),
  ('Referral', 'referral', 1, true),
  ('Facebook', 'facebook', 2, true),
  ('Instagram', 'instagram', 3, true),
  ('TikTok', 'tiktok', 4, true),
  ('WhatsApp', 'whatsapp', 5, true),
  ('SMS', 'sms', 6, true),
  ('Property Finder', 'property_finder', 7, true),
  ('Mzad', 'mzad', 8, true),
  ('Arady', 'arady', 9, true),
  ('Walk-in', 'walk_in', 10, true),
  ('Manual', 'manual', 11, true)
) as seed(name, code, display_order, is_active)
where not exists (select 1 from public.lead_channels);

-- =============================================================================
-- 2. pipeline_stages: optional color tag (client's reference CRM shows a
--    color chip per stage). Nullable - existing stages keep working with no
--    color set.
-- =============================================================================

alter table public.pipeline_stages
  add column if not exists color text;

-- =============================================================================
-- 3. form_field_definitions: the Lead Inputs / Unit Inputs custom-field
--    system. Values are stored in a jsonb column on leads/properties (added
--    below), keyed by this row's "key". Deactivating or renaming a
--    definition never touches historical values already saved in that jsonb
--    column - it only changes what the forms offer going forward.
-- =============================================================================

create table if not exists public.form_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'property')),
  key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'phone', 'email', 'date',
    'boolean', 'checkbox', 'select', 'multiselect'
  )),
  display_order integer not null default 0,
  is_required boolean not null default false,
  is_active boolean not null default true,
  -- Reserved for future system-field rows (native columns exposed here for
  -- limited reordering/visibility config). No system rows are seeded today -
  -- every row this migration and the app create is a custom field, so
  -- is_system defaults false and nothing in the app currently sets it true.
  -- The column exists now so that path never needs a schema change later.
  is_system boolean not null default false,
  is_filterable boolean not null default false,
  is_exportable boolean not null default false,
  show_on_create boolean not null default true,
  show_on_edit boolean not null default true,
  show_on_detail boolean not null default true,
  options jsonb,
  validation jsonb,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_field_definitions_label_not_blank check (length(btrim(label)) > 0),
  constraint form_field_definitions_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

create unique index if not exists form_field_definitions_entity_key_key
  on public.form_field_definitions (entity_type, key);
create index if not exists form_field_definitions_entity_order_idx
  on public.form_field_definitions (entity_type, display_order);

drop trigger if exists form_field_definitions_set_updated_at on public.form_field_definitions;
create trigger form_field_definitions_set_updated_at
  before update on public.form_field_definitions
  for each row execute function public.set_updated_at();

-- A system field is protected from deletion at the database level, not just
-- in the UI - "Cannot delete" is enforced even against a direct API call.
create or replace function public.protect_system_field_definition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_system then
    raise exception 'This is a system field and cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists form_field_definitions_protect_system on public.form_field_definitions;
create trigger form_field_definitions_protect_system
  before delete on public.form_field_definitions
  for each row execute function public.protect_system_field_definition();

alter table public.form_field_definitions enable row level security;

-- Every authenticated staff member reads active+inactive definitions (the
-- settings screen needs inactive ones too); forms filter to is_active
-- client-side. Only settings.manage can write.
drop policy if exists form_field_definitions_select on public.form_field_definitions;
create policy form_field_definitions_select on public.form_field_definitions for select to authenticated using (true);

drop policy if exists form_field_definitions_write on public.form_field_definitions;
create policy form_field_definitions_write on public.form_field_definitions for all to authenticated
  using (public.has_permission('settings', 'manage'))
  with check (public.has_permission('settings', 'manage'));

-- =============================================================================
-- 4. custom_fields jsonb on leads and properties. Defaults to '{}' so every
--    existing row already satisfies "not null" with no backfill needed, and
--    every existing SELECT * / typed read keeps working unchanged.
-- =============================================================================

alter table public.leads
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.properties
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists leads_custom_fields_gin on public.leads using gin (custom_fields);
create index if not exists properties_custom_fields_gin on public.properties using gin (custom_fields);

comment on column public.leads.custom_fields is 'Values for active/retired form_field_definitions (entity_type=lead), keyed by definition.key. Never read/written directly by business logic - only by the dynamic field renderer.';
comment on column public.properties.custom_fields is 'Values for active/retired form_field_definitions (entity_type=property), keyed by definition.key. Never read/written directly by business logic - only by the dynamic field renderer.';

-- custom_fields is just another column on leads/properties, so the existing
-- leads_update / properties_update RLS policies (has_permission('leads'|'properties','edit'))
-- already cover writing it. No new policy needed.
