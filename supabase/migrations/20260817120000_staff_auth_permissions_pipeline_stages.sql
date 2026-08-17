-- Q-Bay Real Estate CRM — staff auth linkage, permission engine, customizable
-- pipeline stages, and row-level security.
--
-- This migration is written for Lovable Cloud (Supabase) to review and apply.
-- It has NOT been run against the live project by the frontend engineering
-- pass — see BACKEND_REQUIREMENTS.md for full context and rollout notes.
--
-- Safe to run once. Uses IF NOT EXISTS / guarded DO blocks throughout so it
-- can be re-run without erroring on objects that already exist.

-- =============================================================================
-- 1. team_members: link to Supabase Auth + permission overrides
-- =============================================================================

alter table public.team_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.team_members
  add column if not exists permissions jsonb;

create unique index if not exists team_members_user_id_key on public.team_members(user_id) where user_id is not null;
create index if not exists team_members_email_lower_idx on public.team_members (lower(email));

comment on column public.team_members.user_id is 'Links this staff row to a real Supabase Auth login. Null = contact-only record with no login access.';
comment on column public.team_members.permissions is 'Fully-resolved PermissionSet JSON (module -> array of allowed actions), written by the frontend/admin-create-staff-user whenever role or overrides change. See src/lib/permissions.ts for the shape.';

-- =============================================================================
-- 2. pipeline_stages: customizable pipeline, replacing the hard-coded list
-- =============================================================================

create table if not exists public.pipeline_stages (
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

create unique index if not exists pipeline_stages_stage_key_key on public.pipeline_stages (stage_key);
create index if not exists pipeline_stages_position_idx on public.pipeline_stages (position);

-- Seed the current hard-coded stages exactly once, only if the table is empty.
insert into public.pipeline_stages (stage_key, name, position, is_active, is_won, is_lost)
select * from (values
  ('new_lead', 'New Lead', 0, true, false, false),
  ('contacted', 'Contacted', 1, true, false, false),
  ('qualified', 'Qualified', 2, true, false, false),
  ('property_matching', 'Property Matching', 3, true, false, false),
  ('viewing_scheduled', 'Viewing Scheduled', 4, true, false, false),
  ('negotiation', 'Negotiation', 5, true, false, false),
  ('documentation', 'Documentation', 6, true, false, false),
  ('won', 'Won', 7, true, true, false),
  ('lost', 'Lost', 8, true, false, true)
) as seed(stage_key, name, position, is_active, is_won, is_lost)
where not exists (select 1 from public.pipeline_stages);

-- =============================================================================
-- 3. Permission-check helpers
-- =============================================================================

-- Resolves the calling user's permission set. An authenticated user with no
-- linked team_members row is treated as a bootstrap administrator (mirrors
-- src/hooks/use-auth.tsx on the frontend) — only an admin can create a
-- Supabase Auth login in the first place, so an unlinked-but-authenticated
-- caller is trusted with full access until they're linked to a staff row.
create or replace function public.current_team_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then '{}'::jsonb
    when tm.id is null then
      -- bootstrap admin: full access to every module/action
      '{"overview":["view"],"leads":["view","create","edit","delete","assign"],
        "properties":["view","create","edit","delete"],"pipeline":["view","move"],
        "conversations":["view","create","edit","delete"],"uploads":["view","upload","delete"],
        "tasks":["view","create","edit","complete"],"ai_insights":["view","run"],
        "property_demand":["view"],"marketing_intelligence":["view"],
        "team":["view","manage"],"settings":["view","manage"],"ai_receptionist":["view","manage"]}'::jsonb
    when tm.is_active is false then '{}'::jsonb
    else coalesce(tm.permissions, '{}'::jsonb)
  end
  from (select 1) as _dummy
  left join public.team_members tm on tm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.has_permission(_module text, _action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.current_team_permissions() -> _module) ? _action,
    false
  );
$$;

grant execute on function public.current_team_permissions() to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;

-- =============================================================================
-- 4. Row-level security
-- =============================================================================
-- NOTE: the app currently runs on an anonymous/public-CRUD model (RLS absent
-- or permissive) as a prototype convenience. This section switches business
-- tables to "authenticated + has_permission()" access. The publishable
-- (anon) client key can no longer read/write these tables directly —
-- everything must go through an authenticated session, matching the new
-- Supabase Auth login flow. Edge functions use the service role key and
-- always bypass RLS.

-- pipeline_stages
alter table public.pipeline_stages enable row level security;
drop policy if exists pipeline_stages_select on public.pipeline_stages;
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated
  using (public.has_permission('pipeline', 'view') or public.has_permission('settings', 'view'));
drop policy if exists pipeline_stages_write on public.pipeline_stages;
create policy pipeline_stages_write on public.pipeline_stages for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));

-- team_members
alter table public.team_members enable row level security;
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to authenticated
  using (public.has_permission('team', 'view') or user_id = auth.uid());
drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members for all to authenticated
  using (public.has_permission('team', 'manage')) with check (public.has_permission('team', 'manage'));

-- leads
alter table public.leads enable row level security;
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated using (public.has_permission('leads', 'view'));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated with check (public.has_permission('leads', 'create'));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.has_permission('leads', 'edit') or public.has_permission('pipeline', 'move'))
  with check (public.has_permission('leads', 'edit') or public.has_permission('pipeline', 'move'));
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated using (public.has_permission('leads', 'delete'));

-- properties
alter table public.properties enable row level security;
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties for select to authenticated using (public.has_permission('properties', 'view'));
drop policy if exists properties_insert on public.properties;
create policy properties_insert on public.properties for insert to authenticated with check (public.has_permission('properties', 'create'));
drop policy if exists properties_update on public.properties;
create policy properties_update on public.properties for update to authenticated
  using (public.has_permission('properties', 'edit')) with check (public.has_permission('properties', 'edit'));
drop policy if exists properties_delete on public.properties;
create policy properties_delete on public.properties for delete to authenticated using (public.has_permission('properties', 'delete'));

-- interactions (conversations module)
alter table public.interactions enable row level security;
drop policy if exists interactions_select on public.interactions;
create policy interactions_select on public.interactions for select to authenticated using (public.has_permission('conversations', 'view'));
drop policy if exists interactions_insert on public.interactions;
create policy interactions_insert on public.interactions for insert to authenticated with check (public.has_permission('conversations', 'create'));
drop policy if exists interactions_update on public.interactions;
create policy interactions_update on public.interactions for update to authenticated
  using (public.has_permission('conversations', 'edit')) with check (public.has_permission('conversations', 'edit'));
drop policy if exists interactions_delete on public.interactions;
create policy interactions_delete on public.interactions for delete to authenticated using (public.has_permission('conversations', 'delete'));

-- uploads
alter table public.uploads enable row level security;
drop policy if exists uploads_select on public.uploads;
create policy uploads_select on public.uploads for select to authenticated using (public.has_permission('uploads', 'view'));
drop policy if exists uploads_insert on public.uploads;
create policy uploads_insert on public.uploads for insert to authenticated with check (public.has_permission('uploads', 'upload'));
drop policy if exists uploads_delete on public.uploads;
create policy uploads_delete on public.uploads for delete to authenticated using (public.has_permission('uploads', 'delete'));

-- tasks
alter table public.tasks enable row level security;
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.has_permission('tasks', 'view'));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_permission('tasks', 'create'));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_permission('tasks', 'edit') or public.has_permission('tasks', 'complete'))
  with check (public.has_permission('tasks', 'edit') or public.has_permission('tasks', 'complete'));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated using (public.has_permission('tasks', 'edit'));

-- lead_property_interests (part of the leads workflow)
alter table public.lead_property_interests enable row level security;
drop policy if exists lead_property_interests_select on public.lead_property_interests;
create policy lead_property_interests_select on public.lead_property_interests for select to authenticated using (public.has_permission('leads', 'view'));
drop policy if exists lead_property_interests_write on public.lead_property_interests;
create policy lead_property_interests_write on public.lead_property_interests for all to authenticated
  using (public.has_permission('leads', 'edit')) with check (public.has_permission('leads', 'edit'));

-- property_media
alter table public.property_media enable row level security;
drop policy if exists property_media_select on public.property_media;
create policy property_media_select on public.property_media for select to authenticated using (public.has_permission('properties', 'view'));
drop policy if exists property_media_write on public.property_media;
create policy property_media_write on public.property_media for all to authenticated
  using (public.has_permission('uploads', 'upload') or public.has_permission('uploads', 'delete'))
  with check (public.has_permission('uploads', 'upload'));

-- pipeline_history (read follows leads; writes happen via trusted client mutations)
alter table public.pipeline_history enable row level security;
drop policy if exists pipeline_history_select on public.pipeline_history;
create policy pipeline_history_select on public.pipeline_history for select to authenticated using (public.has_permission('leads', 'view'));
drop policy if exists pipeline_history_insert on public.pipeline_history;
create policy pipeline_history_insert on public.pipeline_history for insert to authenticated
  with check (public.has_permission('leads', 'create') or public.has_permission('pipeline', 'move'));

-- ai_analyses (view gated by ai_insights.view; writes happen via the service-role edge function only)
alter table public.ai_analyses enable row level security;
drop policy if exists ai_analyses_select on public.ai_analyses;
create policy ai_analyses_select on public.ai_analyses for select to authenticated using (public.has_permission('ai_insights', 'view'));

-- market_intelligence_reports
alter table public.market_intelligence_reports enable row level security;
drop policy if exists market_intelligence_reports_select on public.market_intelligence_reports;
create policy market_intelligence_reports_select on public.market_intelligence_reports for select to authenticated using (public.has_permission('marketing_intelligence', 'view'));

-- property_events / property_demand_scores (view)
alter table public.property_events enable row level security;
drop policy if exists property_events_select on public.property_events;
create policy property_events_select on public.property_events for select to authenticated
  using (public.has_permission('property_demand', 'view') or public.has_permission('properties', 'view'));
drop policy if exists property_events_insert on public.property_events;
create policy property_events_insert on public.property_events for insert to authenticated
  with check (public.has_permission('properties', 'view'));

-- external_market_sources
alter table public.external_market_sources enable row level security;
drop policy if exists external_market_sources_select on public.external_market_sources;
create policy external_market_sources_select on public.external_market_sources for select to authenticated
  using (public.has_permission('marketing_intelligence', 'view') or public.has_permission('property_demand', 'view'));
drop policy if exists external_market_sources_write on public.external_market_sources;
create policy external_market_sources_write on public.external_market_sources for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));

-- app_settings
alter table public.app_settings enable row level security;
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));

-- organisations (read for all authenticated staff, write for admins)
alter table public.organisations enable row level security;
drop policy if exists organisations_select on public.organisations;
create policy organisations_select on public.organisations for select to authenticated using (true);
drop policy if exists organisations_write on public.organisations;
create policy organisations_write on public.organisations for all to authenticated
  using (public.has_permission('settings', 'manage')) with check (public.has_permission('settings', 'manage'));

-- receptionist_* tables: gated by ai_receptionist module
alter table public.receptionist_settings enable row level security;
drop policy if exists receptionist_settings_select on public.receptionist_settings;
create policy receptionist_settings_select on public.receptionist_settings for select to authenticated using (public.has_permission('ai_receptionist', 'view'));
drop policy if exists receptionist_settings_write on public.receptionist_settings;
create policy receptionist_settings_write on public.receptionist_settings for all to authenticated
  using (public.has_permission('ai_receptionist', 'manage')) with check (public.has_permission('ai_receptionist', 'manage'));

alter table public.receptionist_calls enable row level security;
drop policy if exists receptionist_calls_select on public.receptionist_calls;
create policy receptionist_calls_select on public.receptionist_calls for select to authenticated using (public.has_permission('ai_receptionist', 'view'));

alter table public.receptionist_tool_events enable row level security;
drop policy if exists receptionist_tool_events_select on public.receptionist_tool_events;
create policy receptionist_tool_events_select on public.receptionist_tool_events for select to authenticated using (public.has_permission('ai_receptionist', 'view'));

-- NOTE: edge_rate_limits has no client-facing policy — it is only ever
-- accessed by edge functions via the service role, which bypasses RLS.
-- Leave it without authenticated policies (default-deny) intentionally.

-- =============================================================================
-- 5. updated_at trigger for pipeline_stages (matches existing table conventions)
-- =============================================================================

create or replace function public.set_pipeline_stages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pipeline_stages_set_updated_at on public.pipeline_stages;
create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_pipeline_stages_updated_at();
