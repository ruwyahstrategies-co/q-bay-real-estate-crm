-- Q-Bay Real Estate CRM — permission engine, team-scoping helpers, matching
-- engine, and updated_at triggers.

-- =============================================================================
-- 1. Permission engine (strict — no bootstrap-admin fallback)
-- =============================================================================

create or replace function public.current_team_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then '{}'::jsonb
    when tm.id is null then '{}'::jsonb
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
  select coalesce((public.current_team_permissions() -> _module) ? _action, false);
$$;

create or replace function public.current_team_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id from public.team_members tm where tm.user_id = auth.uid() and tm.is_active is true limit 1;
$$;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id from public.team_members tm where tm.user_id = auth.uid() and tm.is_active is true limit 1;
$$;

grant execute on function public.current_team_permissions() to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;
grant execute on function public.current_team_member_id() to authenticated, service_role;
grant execute on function public.current_team_id() to authenticated, service_role;
revoke execute on function public.current_team_permissions() from public, anon;
revoke execute on function public.has_permission(text, text) from public, anon;
revoke execute on function public.current_team_member_id() from public, anon;
revoke execute on function public.current_team_id() from public, anon;

-- check_rate_limit is only ever called by edge functions via the service role.
create or replace function public.check_rate_limit(_key text, _max_per_minute integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
begin
  select * into cur from public.edge_rate_limits where key = _key for update;
  if cur is null then
    insert into public.edge_rate_limits(key, count, window_start) values (_key, 1, now());
    return true;
  end if;
  if now() - cur.window_start > interval '1 minute' then
    update public.edge_rate_limits set count = 1, window_start = now() where key = _key;
    return true;
  end if;
  if cur.count >= _max_per_minute then
    return false;
  end if;
  update public.edge_rate_limits set count = count + 1 where key = _key;
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer) to service_role;

-- =============================================================================
-- 2. updated_at triggers (generic, reused across tables)
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'organisations','teams','team_members','countries','areas','owners','developments',
    'properties','property_leases','pipeline_stages','leads','lead_property_interests',
    'uploads','interactions','tasks','ai_analyses','market_intelligence_reports',
    'external_market_sources','app_settings','agent_whatsapp_connections','blog_posts',
    'website_profiles','property_submissions','transactions','viewings'
  ])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =============================================================================
-- 3. Deterministic matching engine (no ML, no AI required)
-- =============================================================================

create or replace function public.match_properties_for_lead(_lead_id uuid, _limit integer default 10)
returns table(property_id uuid, score numeric, reasons text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l record;
begin
  select * into l from public.leads where id = _lead_id;
  if l is null then return; end if;

  return query
  select
    p.id,
    (
      (case when l.purchase_purpose is not null and p.purpose = l.purchase_purpose then 20 else 0 end)
      + (case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 20 else 0 end)
      + (case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 20 else 0 end)
      + (case when l.preferred_property_types is not null and p.property_type = any(l.preferred_property_types) then 15 else 0 end)
      + (case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 10 else 0 end)
      + (case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 15 else 0 end)
      + (case when l.development_id is not null and p.development_id = l.development_id then 10 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 'matches preferred country' end,
      case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 'matches preferred area' end,
      case when l.preferred_property_types is not null and p.property_type = any(l.preferred_property_types) then 'matches property type' end,
      case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 'matches bedroom count' end,
      case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 'within budget range' end,
      case when l.development_id is not null and p.development_id = l.development_id then 'same development' end
    ], null) as reasons
  from public.properties p
  where p.status = 'active' and p.availability = 'available'
  order by score desc
  limit _limit;
end;
$$;

create or replace function public.match_prospects_for_property(_property_id uuid, _limit integer default 10)
returns table(lead_id uuid, score numeric, reasons text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
begin
  select * into p from public.properties where id = _property_id;
  if p is null then return; end if;

  return query
  select
    l.id,
    (
      (case when l.purchase_purpose is not null and p.purpose = l.purchase_purpose then 20 else 0 end)
      + (case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 20 else 0 end)
      + (case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 20 else 0 end)
      + (case when l.preferred_property_types is not null and p.property_type = any(l.preferred_property_types) then 15 else 0 end)
      + (case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 10 else 0 end)
      + (case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 15 else 0 end)
      + (case when l.development_id is not null and p.development_id = l.development_id then 10 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 'matches preferred country' end,
      case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 'matches preferred area' end,
      case when l.preferred_property_types is not null and p.property_type = any(l.preferred_property_types) then 'matches property type' end,
      case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 'matches bedroom count' end,
      case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 'within budget range' end,
      case when l.development_id is not null and p.development_id = l.development_id then 'same development' end
    ], null) as reasons
  from public.leads l
  where l.status = 'active' and l.pipeline_stage not in ('won', 'lost')
  order by score desc
  limit _limit;
end;
$$;

create or replace function public.similar_properties(_property_id uuid, _limit integer default 8)
returns table(property_id uuid, score numeric, reasons text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base record;
begin
  select * into base from public.properties where id = _property_id;
  if base is null then return; end if;

  return query
  select
    p.id,
    (
      (case when p.purpose = base.purpose then 20 else 0 end)
      + (case when p.country_id = base.country_id then 15 else 0 end)
      + (case when p.area_id = base.area_id then 20 else 0 end)
      + (case when p.property_type = base.property_type then 15 else 0 end)
      + (case when p.bedrooms = base.bedrooms then 10 else 0 end)
      + (case when p.development_id is not null and p.development_id = base.development_id then 15 else 0 end)
      + (case when base.price is not null and p.price is not null
              and p.price between base.price * 0.8 and base.price * 1.2 then 15 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when p.area_id = base.area_id then 'same area' end,
      case when p.property_type = base.property_type then 'same property type' end,
      case when p.development_id is not null and p.development_id = base.development_id then 'same development' end,
      case when base.price is not null and p.price is not null
              and p.price between base.price * 0.8 and base.price * 1.2 then 'similar price range' end
    ], null) as reasons
  from public.properties p
  where p.id <> base.id and p.status = 'active' and p.availability = 'available'
  order by score desc
  limit _limit;
end;
$$;

grant execute on function public.match_properties_for_lead(uuid, integer) to authenticated, service_role;
grant execute on function public.match_prospects_for_property(uuid, integer) to authenticated, service_role;
grant execute on function public.similar_properties(uuid, integer) to authenticated, service_role, anon;
