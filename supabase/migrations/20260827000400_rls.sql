-- Q-Bay Real Estate CRM — Row Level Security across every table.
-- Pattern: has_permission(module, action) is the base gate everywhere.
-- Leads/viewings/tasks/conversations/staff_activity additionally support
-- view / view_team / view_all scoping so a Team Leader sees their team only
-- and a Sales Agent/Telesales user sees their own assigned work only.

-- =============================================================================
-- organisations / app_settings / edge_rate_limits
-- =============================================================================

alter table public.organisations enable row level security;
create policy organisations_select on public.organisations for select to authenticated using (true);
create policy organisations_write on public.organisations for all to authenticated
  using (public.has_permission('settings','manage')) with check (public.has_permission('settings','manage'));

alter table public.app_settings enable row level security;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_write on public.app_settings for all to authenticated
  using (public.has_permission('settings','manage')) with check (public.has_permission('settings','manage'));

alter table public.edge_rate_limits enable row level security;
-- no client-facing policy — service role only.

-- =============================================================================
-- teams / team_members
-- =============================================================================

alter table public.teams enable row level security;
create policy teams_select on public.teams for select to authenticated
  using (public.has_permission('team','view') or public.has_permission('team','manage') or id = public.current_team_id());
create policy teams_write on public.teams for all to authenticated
  using (public.has_permission('team','manage')) with check (public.has_permission('team','manage'));

alter table public.team_members enable row level security;
create policy team_members_select on public.team_members for select to authenticated
  using (public.has_permission('team','view') or public.has_permission('team','manage') or user_id = auth.uid() or team_id = public.current_team_id());
create policy team_members_write on public.team_members for all to authenticated
  using (public.has_permission('team','manage')) with check (public.has_permission('team','manage'));

-- =============================================================================
-- countries / areas (CRM-managed, public-readable for the future website)
-- =============================================================================

alter table public.countries enable row level security;
create policy countries_select_staff on public.countries for select to authenticated using (true);
create policy countries_select_public on public.countries for select to anon using (is_active = true);
create policy countries_write on public.countries for all to authenticated
  using (public.has_permission('locations','manage')) with check (public.has_permission('locations','manage'));

alter table public.areas enable row level security;
create policy areas_select_staff on public.areas for select to authenticated using (true);
create policy areas_select_public on public.areas for select to anon using (is_active = true);
create policy areas_write on public.areas for all to authenticated
  using (public.has_permission('locations','manage')) with check (public.has_permission('locations','manage'));

-- =============================================================================
-- owners
-- =============================================================================

alter table public.owners enable row level security;
create policy owners_select on public.owners for select to authenticated using (public.has_permission('owners','view'));
create policy owners_insert on public.owners for insert to authenticated with check (public.has_permission('owners','create'));
create policy owners_update on public.owners for update to authenticated
  using (public.has_permission('owners','edit')) with check (public.has_permission('owners','edit'));
create policy owners_delete on public.owners for delete to authenticated using (public.has_permission('owners','delete'));

-- =============================================================================
-- developments
-- =============================================================================

alter table public.developments enable row level security;
create policy developments_select_staff on public.developments for select to authenticated using (public.has_permission('developments','view'));
create policy developments_select_public on public.developments for select to anon using (is_published = true);
create policy developments_insert on public.developments for insert to authenticated with check (public.has_permission('developments','create'));
create policy developments_update on public.developments for update to authenticated
  using (public.has_permission('developments','edit') or public.has_permission('developments','publish'))
  with check (public.has_permission('developments','edit') or public.has_permission('developments','publish'));
create policy developments_delete on public.developments for delete to authenticated using (public.has_permission('developments','delete'));

-- =============================================================================
-- properties / property_leases
-- =============================================================================

alter table public.properties enable row level security;
create policy properties_select_staff on public.properties for select to authenticated using (public.has_permission('properties','view'));
create policy properties_select_public on public.properties for select to anon using (is_published = true and status = 'active');
create policy properties_insert on public.properties for insert to authenticated with check (public.has_permission('properties','create'));
create policy properties_update on public.properties for update to authenticated
  using (public.has_permission('properties','edit') or public.has_permission('properties','publish'))
  with check (public.has_permission('properties','edit') or public.has_permission('properties','publish'));
create policy properties_delete on public.properties for delete to authenticated using (public.has_permission('properties','delete'));

alter table public.property_leases enable row level security;
create policy property_leases_select on public.property_leases for select to authenticated using (public.has_permission('properties','view'));
create policy property_leases_write on public.property_leases for all to authenticated
  using (public.has_permission('properties','edit')) with check (public.has_permission('properties','edit'));

-- =============================================================================
-- pipeline_stages
-- =============================================================================

alter table public.pipeline_stages enable row level security;
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated
  using (public.has_permission('pipeline','view') or public.has_permission('settings','view'));
create policy pipeline_stages_write on public.pipeline_stages for all to authenticated
  using (public.has_permission('settings','manage')) with check (public.has_permission('settings','manage'));

-- =============================================================================
-- leads (team-isolated) / pipeline_history / lead_property_interests
-- =============================================================================

alter table public.leads enable row level security;
create policy leads_select on public.leads for select to authenticated using (
  public.has_permission('leads','view_all')
  or (public.has_permission('leads','view_team') and team_id is not null and team_id = public.current_team_id())
  or (public.has_permission('leads','view') and assigned_agent_id = public.current_team_member_id())
);
create policy leads_insert on public.leads for insert to authenticated with check (public.has_permission('leads','create'));
create policy leads_update on public.leads for update to authenticated
  using (
    (public.has_permission('leads','edit') or public.has_permission('pipeline','move'))
    and (
      public.has_permission('leads','view_all')
      or (public.has_permission('leads','view_team') and team_id is not null and team_id = public.current_team_id())
      or (public.has_permission('leads','view') and assigned_agent_id = public.current_team_member_id())
    )
  )
  with check (public.has_permission('leads','edit') or public.has_permission('pipeline','move'));
create policy leads_delete on public.leads for delete to authenticated using (public.has_permission('leads','delete'));

alter table public.pipeline_history enable row level security;
create policy pipeline_history_select on public.pipeline_history for select to authenticated using (public.has_permission('leads','view') or public.has_permission('leads','view_team') or public.has_permission('leads','view_all'));
create policy pipeline_history_insert on public.pipeline_history for insert to authenticated
  with check (public.has_permission('leads','create') or public.has_permission('pipeline','move'));

alter table public.lead_property_interests enable row level security;
create policy lead_property_interests_select on public.lead_property_interests for select to authenticated using (
  exists (select 1 from public.leads l where l.id = lead_property_interests.lead_id and (
    public.has_permission('leads','view_all')
    or (public.has_permission('leads','view_team') and l.team_id = public.current_team_id())
    or (public.has_permission('leads','view') and l.assigned_agent_id = public.current_team_member_id())
  ))
);
create policy lead_property_interests_write on public.lead_property_interests for all to authenticated
  using (public.has_permission('leads','edit')) with check (public.has_permission('leads','edit'));

-- =============================================================================
-- viewings (team-isolated)
-- =============================================================================

alter table public.viewings enable row level security;
create policy viewings_select on public.viewings for select to authenticated using (
  public.has_permission('viewings','view_all')
  or (public.has_permission('viewings','view_team') and exists (select 1 from public.team_members tm where tm.id = viewings.assigned_agent_id and tm.team_id = public.current_team_id()))
  or (public.has_permission('viewings','view') and assigned_agent_id = public.current_team_member_id())
);
create policy viewings_insert on public.viewings for insert to authenticated with check (public.has_permission('viewings','create'));
create policy viewings_update on public.viewings for update to authenticated
  using (public.has_permission('viewings','edit') or public.has_permission('viewings','complete'))
  with check (public.has_permission('viewings','edit') or public.has_permission('viewings','complete'));
create policy viewings_delete on public.viewings for delete to authenticated using (public.has_permission('viewings','edit'));

-- =============================================================================
-- interactions (conversations, scoped via parent lead) / uploads / tasks
-- =============================================================================

alter table public.interactions enable row level security;
create policy interactions_select on public.interactions for select to authenticated using (
  public.has_permission('conversations','view_all')
  or created_by = auth.uid()
  or exists (select 1 from public.leads l where l.id = interactions.lead_id and (
    (public.has_permission('conversations','view_team') and l.team_id = public.current_team_id())
    or (public.has_permission('conversations','view') and l.assigned_agent_id = public.current_team_member_id())
  ))
);
create policy interactions_insert on public.interactions for insert to authenticated with check (public.has_permission('conversations','create'));
create policy interactions_update on public.interactions for update to authenticated
  using (public.has_permission('conversations','edit')) with check (public.has_permission('conversations','edit'));
create policy interactions_delete on public.interactions for delete to authenticated using (public.has_permission('conversations','delete'));

alter table public.uploads enable row level security;
create policy uploads_select on public.uploads for select to authenticated using (public.has_permission('uploads','view'));
create policy uploads_insert on public.uploads for insert to authenticated with check (public.has_permission('uploads','upload'));
create policy uploads_delete on public.uploads for delete to authenticated using (public.has_permission('uploads','delete'));

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (
  public.has_permission('tasks','view_all')
  or (public.has_permission('tasks','view_team') and exists (select 1 from public.team_members tm where tm.id = tasks.assigned_to and tm.team_id = public.current_team_id()))
  or (public.has_permission('tasks','view') and assigned_to = public.current_team_member_id())
);
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_permission('tasks','create'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_permission('tasks','edit') or public.has_permission('tasks','complete'))
  with check (public.has_permission('tasks','edit') or public.has_permission('tasks','complete'));
create policy tasks_delete on public.tasks for delete to authenticated using (public.has_permission('tasks','edit'));

alter table public.property_media enable row level security;
create policy property_media_select_staff on public.property_media for select to authenticated using (public.has_permission('properties','view'));
create policy property_media_select_public on public.property_media for select to anon using (
  exists (select 1 from public.properties p where p.id = property_media.property_id and p.is_published = true)
);
create policy property_media_write on public.property_media for all to authenticated
  using (public.has_permission('uploads','upload') or public.has_permission('uploads','delete') or public.has_permission('properties','edit'))
  with check (public.has_permission('uploads','upload') or public.has_permission('properties','edit'));

-- =============================================================================
-- ai_analyses / market_intelligence_reports / external_market_sources / property_events
-- =============================================================================

alter table public.ai_analyses enable row level security;
create policy ai_analyses_select on public.ai_analyses for select to authenticated using (public.has_permission('ai_insights','view'));

alter table public.market_intelligence_reports enable row level security;
create policy market_intelligence_reports_select on public.market_intelligence_reports for select to authenticated using (public.has_permission('marketing_intelligence','view'));

alter table public.external_market_sources enable row level security;
create policy external_market_sources_select on public.external_market_sources for select to authenticated
  using (public.has_permission('marketing_intelligence','view') or public.has_permission('property_demand','view'));
create policy external_market_sources_write on public.external_market_sources for all to authenticated
  using (public.has_permission('settings','manage')) with check (public.has_permission('settings','manage'));

alter table public.property_events enable row level security;
create policy property_events_select on public.property_events for select to authenticated
  using (public.has_permission('property_demand','view') or public.has_permission('properties','view'));
create policy property_events_insert on public.property_events for insert to authenticated
  with check (public.has_permission('properties','view'));

grant select on public.property_demand_scores to authenticated, service_role;

-- =============================================================================
-- Per-agent WhatsApp connections — self-service only, admins see status not tokens
-- =============================================================================

alter table public.agent_whatsapp_connections enable row level security;
create policy agent_whatsapp_select on public.agent_whatsapp_connections for select to authenticated
  using (team_member_id = public.current_team_member_id() or public.has_permission('team','manage'));
create policy agent_whatsapp_write on public.agent_whatsapp_connections for all to authenticated
  using (team_member_id = public.current_team_member_id())
  with check (team_member_id = public.current_team_member_id());

alter table public.whatsapp_webhook_routes enable row level security;
-- no client-facing policy — service role only (edge function webhook routing).

-- =============================================================================
-- Website CMS: blog_posts / website_profiles / property_submissions / website_enquiries
-- =============================================================================

alter table public.blog_posts enable row level security;
create policy blog_posts_select_staff on public.blog_posts for select to authenticated using (public.has_permission('journal','view'));
create policy blog_posts_select_public on public.blog_posts for select to anon using (is_published = true);
create policy blog_posts_insert on public.blog_posts for insert to authenticated with check (public.has_permission('journal','create'));
create policy blog_posts_update on public.blog_posts for update to authenticated
  using (public.has_permission('journal','edit') or public.has_permission('journal','publish'))
  with check (public.has_permission('journal','edit') or public.has_permission('journal','publish'));
create policy blog_posts_delete on public.blog_posts for delete to authenticated using (public.has_permission('journal','delete'));

alter table public.website_profiles enable row level security;
create policy website_profiles_select_self on public.website_profiles for select to authenticated using (id = auth.uid());
create policy website_profiles_insert_self on public.website_profiles for insert to authenticated with check (id = auth.uid());
create policy website_profiles_update_self on public.website_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.property_submissions enable row level security;
create policy property_submissions_select on public.property_submissions for select to authenticated
  using (website_profile_id = auth.uid() or public.has_permission('submissions','view'));
create policy property_submissions_insert on public.property_submissions for insert to authenticated
  with check (website_profile_id = auth.uid());
create policy property_submissions_update on public.property_submissions for update to authenticated
  using (website_profile_id = auth.uid() or public.has_permission('submissions','review'))
  with check (website_profile_id = auth.uid() or public.has_permission('submissions','review'));

alter table public.website_enquiries enable row level security;
create policy website_enquiries_select on public.website_enquiries for select to authenticated using (public.has_permission('website_enquiries','view'));
create policy website_enquiries_update on public.website_enquiries for update to authenticated
  using (public.has_permission('website_enquiries','assign')) with check (public.has_permission('website_enquiries','assign'));
-- no anon/authenticated insert policy — only the public-enquiry edge function
-- (service role) may write here, so anonymous visitors can never touch
-- internal tables directly.

-- =============================================================================
-- Accounting / staff activity
-- =============================================================================

alter table public.transactions enable row level security;
create policy transactions_select on public.transactions for select to authenticated using (public.has_permission('accounting','view'));
create policy transactions_write on public.transactions for all to authenticated
  using (public.has_permission('accounting','manage')) with check (public.has_permission('accounting','manage'));

alter table public.staff_sessions enable row level security;
create policy staff_sessions_select on public.staff_sessions for select to authenticated using (
  public.has_permission('staff_activity','view_all')
  or (public.has_permission('staff_activity','view_team') and exists (select 1 from public.team_members tm where tm.id = staff_sessions.team_member_id and tm.team_id = public.current_team_id()))
  or team_member_id = public.current_team_member_id()
);
create policy staff_sessions_write on public.staff_sessions for all to authenticated
  using (team_member_id = public.current_team_member_id()) with check (team_member_id = public.current_team_member_id());

alter table public.staff_activity_events enable row level security;
create policy staff_activity_events_select on public.staff_activity_events for select to authenticated using (
  public.has_permission('staff_activity','view_all')
  or (public.has_permission('staff_activity','view_team') and exists (select 1 from public.team_members tm where tm.id = staff_activity_events.team_member_id and tm.team_id = public.current_team_id()))
  or team_member_id = public.current_team_member_id()
);
create policy staff_activity_events_insert on public.staff_activity_events for insert to authenticated
  with check (team_member_id = public.current_team_member_id());
