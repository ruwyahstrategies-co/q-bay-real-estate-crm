-- Q-Bay Real Estate CRM — offers workflow, development media galleries, and
-- public-safe views for the website (properties, developments, blog, agents).

-- =============================================================================
-- 1. offers (lean: lead, property/development, agent, amount, status, notes, dates)
-- =============================================================================

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  development_id uuid references public.developments(id) on delete set null,
  agent_id uuid references public.team_members(id) on delete set null,
  amount numeric,
  currency text default 'QAR',
  status text not null default 'draft', -- draft|submitted|countered|accepted|rejected|withdrawn|expired
  notes text,
  offer_date date not null default current_date,
  expiry_date date,
  decided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index offers_lead_idx on public.offers (lead_id);
create index offers_property_idx on public.offers (property_id);
create index offers_agent_idx on public.offers (agent_id);

create trigger set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

alter table public.offers enable row level security;

create policy offers_select on public.offers for select to authenticated using (
  public.has_permission('offers','view_all')
  or (public.has_permission('offers','view_team') and exists (
    select 1 from public.team_members tm where tm.id = offers.agent_id and tm.team_id = public.current_team_id()
  ))
  or (public.has_permission('offers','view') and agent_id = public.current_team_member_id())
);
create policy offers_insert on public.offers for insert to authenticated with check (public.has_permission('offers','create'));
create policy offers_update on public.offers for update to authenticated
  using (public.has_permission('offers','edit')) with check (public.has_permission('offers','edit'));
create policy offers_delete on public.offers for delete to authenticated using (public.has_permission('offers','delete'));

-- =============================================================================
-- 2. development_media (galleries for developments, mirrors property_media)
-- =============================================================================

create table public.development_media (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  media_type text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index development_media_development_idx on public.development_media (development_id);

alter table public.development_media enable row level security;

create policy development_media_select_staff on public.development_media for select to authenticated using (public.has_permission('developments','view'));
create policy development_media_select_public on public.development_media for select to anon using (
  exists (select 1 from public.developments d where d.id = development_media.development_id and d.is_published = true)
);
create policy development_media_write on public.development_media for all to authenticated
  using (public.has_permission('uploads','upload') or public.has_permission('developments','edit'))
  with check (public.has_permission('uploads','upload') or public.has_permission('developments','edit'));

-- Uploads referenced by a published property/development's gallery become
-- readable to anon (public_url/mime_type only matter there) — every other
-- upload (lead docs, call recordings, submissions) stays fully staff-only.
create policy uploads_select_public on public.uploads for select to anon using (
  exists (
    select 1 from public.property_media pm join public.properties p on p.id = pm.property_id
    where pm.upload_id = uploads.id and p.is_published = true
  )
  or exists (
    select 1 from public.development_media dm join public.developments d on d.id = dm.development_id
    where dm.upload_id = uploads.id and d.is_published = true
  )
);

-- =============================================================================
-- 3. Public-safe views for the website (curated columns only, anon-readable)
-- =============================================================================

create view public.public_agents as
select tm.id, tm.full_name, tm.avatar_url, tm.role
from public.team_members tm
where tm.is_active = true;

grant select on public.public_agents to anon, authenticated;

create view public.public_properties as
select
  p.id, p.title, p.reference_code, p.description, p.location, p.latitude, p.longitude,
  p.purpose, p.property_type, p.developer, p.price, p.currency, p.bedrooms, p.bathrooms,
  p.size, p.size_unit, p.plot_size, p.completion_status, p.availability, p.amenities,
  p.highlights, p.hero_image_url, p.hero_video_url, p.tour_360_url, p.slug, p.seo_title,
  p.seo_description, p.listing_source, p.last_refreshed_at, p.created_at, p.updated_at,
  p.country_id, c.name as country_name, c.slug as country_slug,
  p.area_id, a.name as area_name, a.slug as area_slug,
  p.development_id, d.name as development_name, d.slug as development_slug,
  p.assigned_agent_id, ag.full_name as assigned_agent_name, ag.avatar_url as assigned_agent_avatar
from public.properties p
left join public.countries c on c.id = p.country_id
left join public.areas a on a.id = p.area_id
left join public.developments d on d.id = p.development_id
left join public.team_members ag on ag.id = p.assigned_agent_id
where p.is_published = true and p.status = 'active';

grant select on public.public_properties to anon, authenticated;

create view public.public_developments as
select
  d.id, d.name, d.slug, d.developer, d.description, d.status, d.latitude, d.longitude,
  d.hero_image_url, d.hero_video_url, d.tour_360_url, d.property_types, d.price_from,
  d.price_to, d.currency, d.amenities, d.payment_plan, d.unit_mix, d.completion_status,
  d.delivery_timeline, d.seo_title, d.seo_description, d.created_at, d.updated_at,
  d.country_id, c.name as country_name, c.slug as country_slug,
  d.area_id, a.name as area_name, a.slug as area_slug,
  d.assigned_agent_id, ag.full_name as assigned_agent_name, ag.avatar_url as assigned_agent_avatar
from public.developments d
left join public.countries c on c.id = d.country_id
left join public.areas a on a.id = d.area_id
left join public.team_members ag on ag.id = d.assigned_agent_id
where d.is_published = true;

grant select on public.public_developments to anon, authenticated;

create view public.public_blog_posts as
select
  b.id, b.title, b.slug, b.content, b.excerpt, b.featured_image, b.published_at,
  b.seo_title, b.seo_description,
  ag.full_name as author_name, ag.avatar_url as author_avatar
from public.blog_posts b
left join public.team_members ag on ag.id = b.author_id
where b.is_published = true;

grant select on public.public_blog_posts to anon, authenticated;
