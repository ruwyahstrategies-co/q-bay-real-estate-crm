-- Supabase's linter flags bare "security definer" views (public_properties,
-- public_developments, public_blog_posts, public_agents) as ERROR-level: an
-- ordinary view running with the creator's privileges can't have search_path
-- pinned the way a function can, which is the actual footgun. Replace all
-- four with SECURITY DEFINER functions (search_path pinned), matching the
-- pattern already used everywhere else in this schema (has_permission,
-- similar_properties, etc). PostgREST still lets the website filter/order
-- these exactly like a view via .rpc(name).eq(...).order(...).

drop view if exists public.public_properties;
drop view if exists public.public_developments;
drop view if exists public.public_blog_posts;
drop view if exists public.public_agents;

create or replace function public.public_agents()
returns table (id uuid, full_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select tm.id, tm.full_name, tm.avatar_url, tm.role
  from public.team_members tm
  where tm.is_active = true;
$$;
grant execute on function public.public_agents() to anon, authenticated;

create or replace function public.public_properties()
returns table (
  id uuid, title text, reference_code text, description text, location text, latitude numeric, longitude numeric,
  purpose text, property_type text, developer text, price numeric, currency text, bedrooms integer, bathrooms integer,
  size numeric, size_unit text, plot_size numeric, completion_status text, availability text, amenities text[],
  highlights text[], hero_image_url text, hero_video_url text, tour_360_url text, slug text, seo_title text,
  seo_description text, listing_source text, last_refreshed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  country_id uuid, country_name text, country_slug text, area_id uuid, area_name text, area_slug text,
  development_id uuid, development_name text, development_slug text,
  assigned_agent_id uuid, assigned_agent_name text, assigned_agent_avatar text
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.title, p.reference_code, p.description, p.location, p.latitude, p.longitude,
    p.purpose, p.property_type, p.developer, p.price, p.currency, p.bedrooms, p.bathrooms,
    p.size, p.size_unit, p.plot_size, p.completion_status, p.availability, p.amenities,
    p.highlights, p.hero_image_url, p.hero_video_url, p.tour_360_url, p.slug, p.seo_title,
    p.seo_description, p.listing_source, p.last_refreshed_at, p.created_at, p.updated_at,
    p.country_id, c.name, c.slug,
    p.area_id, a.name, a.slug,
    p.development_id, d.name, d.slug,
    p.assigned_agent_id, ag.full_name, ag.avatar_url
  from public.properties p
  left join public.countries c on c.id = p.country_id
  left join public.areas a on a.id = p.area_id
  left join public.developments d on d.id = p.development_id
  left join public.team_members ag on ag.id = p.assigned_agent_id
  where p.is_published = true and p.status = 'active';
$$;
grant execute on function public.public_properties() to anon, authenticated;

create or replace function public.public_developments()
returns table (
  id uuid, name text, slug text, developer text, description text, status text, latitude numeric, longitude numeric,
  hero_image_url text, hero_video_url text, tour_360_url text, property_types text[], price_from numeric,
  price_to numeric, currency text, amenities text[], payment_plan jsonb, unit_mix jsonb, completion_status text,
  delivery_timeline text, seo_title text, seo_description text, created_at timestamptz, updated_at timestamptz,
  country_id uuid, country_name text, country_slug text, area_id uuid, area_name text, area_slug text,
  assigned_agent_id uuid, assigned_agent_name text, assigned_agent_avatar text, has_brochure boolean
)
language sql stable security definer set search_path = public as $$
  select
    d.id, d.name, d.slug, d.developer, d.description, d.status, d.latitude, d.longitude,
    d.hero_image_url, d.hero_video_url, d.tour_360_url, d.property_types, d.price_from,
    d.price_to, d.currency, d.amenities, d.payment_plan, d.unit_mix, d.completion_status,
    d.delivery_timeline, d.seo_title, d.seo_description, d.created_at, d.updated_at,
    d.country_id, c.name, c.slug,
    d.area_id, a.name, a.slug,
    d.assigned_agent_id, ag.full_name, ag.avatar_url,
    (d.brochure_upload_id is not null)
  from public.developments d
  left join public.countries c on c.id = d.country_id
  left join public.areas a on a.id = d.area_id
  left join public.team_members ag on ag.id = d.assigned_agent_id
  where d.is_published = true;
$$;
grant execute on function public.public_developments() to anon, authenticated;

create or replace function public.public_blog_posts()
returns table (
  id uuid, title text, slug text, content text, excerpt text, featured_image text, published_at timestamptz,
  seo_title text, seo_description text, author_name text, author_avatar text, category text
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.title, b.slug, b.content, b.excerpt, b.featured_image, b.published_at,
    b.seo_title, b.seo_description, ag.full_name, ag.avatar_url, b.category
  from public.blog_posts b
  left join public.team_members ag on ag.id = b.author_id
  where b.is_published = true;
$$;
grant execute on function public.public_blog_posts() to anon, authenticated;
