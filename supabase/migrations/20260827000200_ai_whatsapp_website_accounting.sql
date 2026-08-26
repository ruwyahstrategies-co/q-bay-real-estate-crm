-- Q-Bay Real Estate CRM — clean bootstrap schema (part 2: AI/market intelligence,
-- demand tracking, per-agent WhatsApp, website CMS, accounting, staff activity).

-- =============================================================================
-- 1. AI analyses, market intelligence, demand tracking, external sources
-- =============================================================================

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  analysis_type text,
  status text not null default 'pending',
  model text,
  input_snapshot jsonb,
  output_json jsonb,
  confidence numeric,
  source_signature text,
  source_updated_at timestamptz,
  is_outdated boolean not null default false,
  outdated_reason text,
  error_message text,
  generated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_analyses_lead_idx on public.ai_analyses (lead_id);

create table public.market_intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Market Intelligence Report',
  status text not null default 'pending',
  model text,
  input_snapshot jsonb,
  output_json jsonb,
  source_ids text[] not null default '{}',
  lead_count integer not null default 0,
  conversation_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_marketing_report_id_fkey foreign key (marketing_report_id) references public.market_intelligence_reports(id) on delete set null;

create table public.external_market_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  publisher text,
  query text,
  summary text,
  price_info jsonb,
  raw jsonb,
  relevant_locations text[] not null default '{}',
  relevant_property_types text[] not null default '{}',
  active boolean not null default true,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null, -- view | mention | enquiry | viewing_request | offer | shortlist | brochure_download | rejection | mentioned_in_call
  source text,
  source_ref text,
  weight numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index property_events_property_idx on public.property_events (property_id);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index app_settings_key_key on public.app_settings (setting_key);

create table public.edge_rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

create view public.property_demand_scores
with (security_invoker = on) as
select
  p.id as property_id,
  count(*) filter (where e.event_type = 'view') as views,
  count(*) filter (where e.event_type = 'mention') as mentions,
  count(*) filter (where e.event_type = 'enquiry') as enquiries,
  count(*) filter (where e.event_type = 'viewing_request') as viewing_requests,
  count(*) filter (where e.event_type = 'offer') as offers,
  count(*) filter (where e.event_type = 'shortlist') as shortlists,
  count(*) filter (where e.event_type = 'brochure_download') as brochure_downloads,
  count(*) filter (where e.event_type = 'rejection') as rejections,
  count(distinct i.lead_id) filter (where i.status <> 'lost') as interested_leads,
  count(distinct e.lead_id) as unique_event_leads,
  count(*) filter (where e.event_type = 'won') as closed_deals,
  max(e.occurred_at) as last_event_at,
  (select count(*) from public.leads l where l.pipeline_stage = 'won' and exists (
    select 1 from public.lead_property_interests li where li.lead_id = l.id and li.property_id = p.id
  )) as demand_score
from public.properties p
left join public.property_events e on e.property_id = p.id
left join public.lead_property_interests i on i.property_id = p.id
group by p.id;

-- =============================================================================
-- 2. Per-agent WhatsApp Business API connections (secrets kept out of the row)
-- =============================================================================

create extension if not exists supabase_vault;

create table public.agent_whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null unique references public.team_members(id) on delete cascade,
  phone_number_id text,
  waba_id text,
  display_phone_number text,
  connection_status text not null default 'disconnected', -- disconnected | connected | error
  last_error text,
  access_token_secret_id uuid, -- id into vault.secrets — never the raw token
  webhook_verify_token_secret_id uuid,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_webhook_routes (
  phone_number_id text primary key,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 3. Website CMS readiness (blog, public users, submissions, enquiries)
-- =============================================================================

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  content text,
  excerpt text,
  featured_image text,
  author_id uuid references public.team_members(id) on delete set null,
  is_published boolean not null default false,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public website users — isolated from staff. 1:1 with a Supabase Auth login
-- that has NO team_members row (public users must never resolve as staff).
create table public.website_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_submissions (
  id uuid primary key default gen_random_uuid(),
  website_profile_id uuid references public.website_profiles(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  country_id uuid references public.countries(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  location text,
  property_type text,
  purpose text,
  price numeric,
  currency text default 'QAR',
  bedrooms integer,
  bathrooms integer,
  size numeric,
  description text,
  media jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  status text not null default 'draft', -- draft|submitted|under_review|approved|rejected|published
  reviewed_by uuid references public.team_members(id) on delete set null,
  review_notes text,
  converted_property_id uuid references public.properties(id) on delete set null,
  submitted_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.website_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  message text,
  property_id uuid references public.properties(id) on delete set null,
  development_id uuid references public.developments(id) on delete set null,
  source_url text,
  assigned_agent_id uuid references public.team_members(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 4. Accounting / commercial
-- =============================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  agent_id uuid references public.team_members(id) on delete set null,
  transaction_type text not null default 'sale', -- sale | rental | commission_only
  transaction_value numeric,
  commission_value numeric,
  income numeric,
  expense numeric,
  currency text default 'QAR',
  status text not null default 'pending', -- pending | closed | cancelled
  closed_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_agent_idx on public.transactions (agent_id);
create index transactions_closed_at_idx on public.transactions (closed_at);

-- =============================================================================
-- 5. Staff activity / check-in (mobile-ready, no separate app)
-- =============================================================================

create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  check_in_latitude numeric,
  check_in_longitude numeric,
  check_out_latitude numeric,
  check_out_longitude numeric,
  created_at timestamptz not null default now()
);

create index staff_sessions_member_idx on public.staff_sessions (team_member_id);

create table public.staff_activity_events (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  event_type text not null,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  viewing_id uuid references public.viewings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index staff_activity_member_idx on public.staff_activity_events (team_member_id);
