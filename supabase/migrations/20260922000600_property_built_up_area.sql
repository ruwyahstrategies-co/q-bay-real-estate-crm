-- Built-up Area: a dedicated property measurement, separate from `size` (the headline
-- unit area) and `plot_size` (land). Own unit column so it is never confused with either.
-- Additive: existing rows keep built_up_area null until staff fill it in.

alter table public.properties
  add column if not exists built_up_area numeric,
  add column if not exists built_up_area_unit text default 'sqm';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_built_up_area_check') then
    alter table public.properties
      add constraint properties_built_up_area_check
      check (built_up_area is null or built_up_area >= 0);
  end if;
end $$;

-- Public website payload gains built_up_area and built_up_area_unit (appended, so existing
-- consumers that select named columns are unaffected).
drop function if exists public.public_properties();
create function public.public_properties()
returns table (
  id uuid, title text, reference_code text, description text, location text,
  latitude numeric, longitude numeric, purpose text, property_type text, developer text,
  price numeric, currency text, bedrooms integer, bathrooms integer, size numeric,
  size_unit text, plot_size numeric, completion_status text, availability text,
  amenities text[], highlights text[], hero_image_url text, hero_video_url text,
  tour_360_url text, slug text, seo_title text, seo_description text, listing_source text,
  last_refreshed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  country_id uuid, country_name text, country_slug text, area_id uuid, area_name text,
  area_slug text, development_id uuid, development_name text, development_slug text,
  assigned_agent_id uuid, assigned_agent_name text, assigned_agent_avatar text,
  assigned_agent_role text, tower_name text, floor_number text, unit_number text,
  parking_spaces integer, furnishing_status text, available_from date, maids_room boolean,
  majlis boolean, indoor_majlis boolean, outdoor_majlis boolean,
  cloudflare_video_uid text, cloudflare_video_status text, balcony boolean,
  built_up_area numeric, built_up_area_unit text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id, p.title, p.reference_code, p.description, p.location, p.latitude, p.longitude,
    p.purpose, p.property_type, p.developer, p.price, p.currency, p.bedrooms, p.bathrooms,
    p.size, p.size_unit, p.plot_size, p.completion_status, p.availability, p.amenities,
    p.highlights, p.hero_image_url, p.hero_video_url, p.tour_360_url, p.slug, p.seo_title,
    p.seo_description, p.listing_source, p.last_refreshed_at, p.created_at, p.updated_at,
    p.country_id, c.name, c.slug,
    p.area_id, a.name, a.slug,
    p.development_id, d.name, d.slug,
    p.assigned_agent_id, ag.full_name, ag.avatar_url, ag.role,
    p.tower_name, p.floor_number, p.unit_number, p.parking_spaces, p.furnishing_status,
    p.available_from, p.maids_room, p.majlis, p.indoor_majlis, p.outdoor_majlis,
    p.cloudflare_video_uid, p.cloudflare_video_status, p.balcony,
    p.built_up_area, p.built_up_area_unit
  from public.properties p
  left join public.countries c on c.id = p.country_id
  left join public.areas a on a.id = p.area_id
  left join public.developments d on d.id = p.development_id
  left join public.team_members ag on ag.id = p.assigned_agent_id
  where p.is_published = true and p.status = 'active';
$$;

grant execute on function public.public_properties() to anon, authenticated, service_role;
