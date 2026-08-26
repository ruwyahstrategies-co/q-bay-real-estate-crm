-- Q-Bay Real Estate CRM — clean bootstrap schema (part 1: core CRM + locations + developments/owners + viewings)
-- Rebuilt from scratch against the empty vnfcejfvncivthazteif project. Ground truth: the previous generated
-- src/integrations/supabase/types.ts plus the final build scope (teams/locations/developments/owners/viewings).

-- =============================================================================
-- 0. organisations
-- =============================================================================

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text,
  default_currency text default 'QAR',
  logo_url text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 1. teams + team_members (staff auth linkage, permission engine)
-- =============================================================================

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  name text not null,
  leader_id uuid, -- FK added after team_members exists
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role text,
  permissions jsonb,
  is_active boolean not null default true,
  avatar_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teams
  add constraint teams_leader_id_fkey foreign key (leader_id) references public.team_members(id) on delete set null;

create unique index team_members_user_id_key on public.team_members(user_id) where user_id is not null;
create index team_members_email_lower_idx on public.team_members (lower(email));
create index team_members_team_id_idx on public.team_members (team_id);

comment on column public.team_members.user_id is 'Links this staff row to a real Supabase Auth login. Null = contact-only record with no login access.';
comment on column public.team_members.permissions is 'Fully-resolved PermissionSet JSON (module -> array of allowed actions). See src/lib/permissions.ts for the shape.';

-- =============================================================================
-- 2. countries + areas
-- =============================================================================

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  slug text unique not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index areas_country_slug_key on public.areas (country_id, slug);

-- =============================================================================
-- 3. owners
-- =============================================================================

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 4. developments
-- =============================================================================

create table public.developments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  name text not null,
  slug text unique not null,
  developer text,
  owner_id uuid references public.owners(id) on delete set null,
  country_id uuid references public.countries(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  latitude numeric,
  longitude numeric,
  description text,
  status text default 'off_plan',
  hero_image_url text,
  hero_video_url text,
  tour_360_url text,
  brochure_upload_id uuid,
  property_types text[],
  price_from numeric,
  price_to numeric,
  currency text default 'QAR',
  amenities text[],
  payment_plan jsonb default '{}'::jsonb,
  unit_mix jsonb default '{}'::jsonb,
  completion_status text,
  delivery_timeline text,
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  is_published boolean not null default false,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index developments_country_area_idx on public.developments (country_id, area_id);

-- =============================================================================
-- 5. properties (final, website-ready)
-- =============================================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  title text not null,
  reference_code text,
  description text,
  country_id uuid references public.countries(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  location text,
  latitude numeric,
  longitude numeric,
  purpose text not null default 'sale', -- sale | rent | commercial
  property_type text,
  developer text,
  development_id uuid references public.developments(id) on delete set null,
  owner_id uuid references public.owners(id) on delete set null,
  price numeric,
  currency text default 'QAR',
  bedrooms integer,
  bathrooms integer,
  size numeric,
  size_unit text default 'sqm',
  plot_size numeric,
  completion_status text,
  availability text not null default 'available',
  amenities text[],
  highlights text[],
  hero_image_url text,
  hero_video_url text,
  tour_360_url text,
  assigned_team text[],
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  status text not null default 'active',
  is_published boolean not null default false,
  slug text unique,
  seo_title text,
  seo_description text,
  listing_source text default 'internal',
  last_refreshed_at timestamptz,
  expires_at timestamptz,
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_country_area_idx on public.properties (country_id, area_id);
create index properties_development_idx on public.properties (development_id);
create index properties_agent_idx on public.properties (assigned_agent_id);

-- Basic property operations (tenant/lease/payment/maintenance) — deliberately lean.
create table public.property_leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_name text,
  tenant_phone text,
  tenant_email text,
  lease_start date,
  lease_end date,
  rent_amount numeric,
  currency text default 'QAR',
  payment_status text default 'current', -- current | overdue | pending
  contract_upload_id uuid,
  maintenance_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_leases_property_idx on public.property_leases (property_id);

-- =============================================================================
-- 6. pipeline stages
-- =============================================================================

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  stage_key text not null,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index pipeline_stages_stage_key_key on public.pipeline_stages (stage_key);
create index pipeline_stages_position_idx on public.pipeline_stages (position);

insert into public.pipeline_stages (stage_key, name, position, is_active, is_won, is_lost) values
  ('new_lead', 'New Lead', 0, true, false, false),
  ('contacted', 'Contacted', 1, true, false, false),
  ('qualified', 'Qualified', 2, true, false, false),
  ('property_matching', 'Property Matching', 3, true, false, false),
  ('viewing_scheduled', 'Viewing Scheduled', 4, true, false, false),
  ('negotiation', 'Negotiation', 5, true, false, false),
  ('documentation', 'Documentation', 6, true, false, false),
  ('won', 'Won', 7, true, true, false),
  ('lost', 'Lost', 8, true, false, true);

-- =============================================================================
-- 7. leads (final, sales + telesales)
-- =============================================================================

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  nationality text,
  preferred_language text,
  classification text default 'buyer', -- buyer | renter | investor | commercial
  budget_min numeric,
  budget_max numeric,
  currency text default 'QAR',
  preferred_country_id uuid references public.countries(id) on delete set null,
  preferred_area_id uuid references public.areas(id) on delete set null,
  preferred_locations text[],
  preferred_property_types text[],
  preferred_bedrooms integer[],
  purchase_purpose text,
  buying_timeline text,
  financing_status text,
  lead_source text default 'manual',
  workflow text not null default 'sales', -- sales | telesales
  intent_score numeric,
  priority text default 'medium',
  status text not null default 'active',
  pipeline_stage text not null default 'new_lead',
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  development_id uuid references public.developments(id) on delete set null,
  notes text,
  telesales_outcome text,
  telesales_qualified boolean default false,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_agent_idx on public.leads (assigned_agent_id);
create index leads_team_idx on public.leads (team_id);
create index leads_workflow_idx on public.leads (workflow);
create index leads_pipeline_stage_idx on public.leads (pipeline_stage);

create table public.pipeline_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  previous_stage text,
  new_stage text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create table public.lead_property_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  interest_level text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 8. viewings
-- =============================================================================

create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled', -- scheduled | confirmed | completed | cancelled | no_show
  notes text,
  latitude numeric,
  longitude numeric,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index viewings_agent_idx on public.viewings (assigned_agent_id);
create index viewings_lead_idx on public.viewings (lead_id);
create index viewings_property_idx on public.viewings (property_id);

-- =============================================================================
-- 9. interactions, uploads, tasks
-- =============================================================================

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  category text not null,
  filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text,
  mime_type text,
  file_size bigint,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  extracted_text text,
  processing_status text not null default 'pending',
  processing_error text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  upload_id uuid references public.uploads(id) on delete set null,
  interaction_type text not null, -- whatsapp | phone_call | email | meeting | website_enquiry | walk_in | manual_note
  direction text,
  subject text,
  content text,
  transcript text,
  duration_seconds integer,
  interaction_date timestamptz not null default now(),
  ai_processed_at timestamptz,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interactions_lead_idx on public.interactions (lead_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  task_type text, -- follow_up | viewing | new_lead | property_match | listing_refresh | general
  priority text not null default 'medium',
  status text not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  lead_id uuid references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  marketing_report_id uuid,
  assigned_to uuid references public.team_members(id) on delete set null,
  source text,
  source_ref text,
  refs jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assigned_idx on public.tasks (assigned_to);
create index tasks_lead_idx on public.tasks (lead_id);

create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  media_type text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- tasks.marketing_report_id FK to market_intelligence_reports is added in the
-- next migration file, once that table exists.
