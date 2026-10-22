-- Villa Standalone and Villa Compound, without breaking anything that already reads property types.
--
--   * New properties choose "Villa Standalone" or "Villa Compound". Existing "Villa" records are NOT rewritten;
--     they keep working and can be classified when someone next edits them.
--   * The public website only knows "Villa" (it shows an unknown type as an Apartment). The public view
--     therefore keeps reporting "Villa" for both new types, so the website and its Villa filter are unchanged.
--   * Matching a lead's preferred types and finding similar properties treat the villa types as one family:
--     a lead who wants a "Villa" matches both kinds, and a lead who wants a "Villa Compound" matches that kind.
--   * Lead and property matching now run with the caller's own permissions (they used to read every lead and
--     every property as the database owner, which let any signed-in staff member list other agents' leads).

create or replace function public.property_type_family(_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(_type, ''))) in ('villa', 'villa standalone', 'villa compound', 'standalone villa', 'compound villa') then 'villa'
    else lower(btrim(coalesce(_type, '')))
  end;
$$;

-- True when a property's type satisfies any of a lead's preferred types.
create or replace function public.property_type_matches(_property_type text, _preferred text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_or(
           lower(btrim(x)) = lower(btrim(coalesce(_property_type, '')))
           -- A plain "Villa" preference (or a legacy "Villa" property) covers the whole villa family.
           or (lower(btrim(x)) = 'villa' and public.property_type_family(_property_type) = 'villa')
           or (lower(btrim(coalesce(_property_type, ''))) = 'villa' and public.property_type_family(x) = 'villa')
         ), false)
    from unnest(coalesce(_preferred, '{}'::text[])) x;
$$;

create or replace function public.public_properties()
returns table(
  id uuid, title text, reference_code text, description text, location text, latitude numeric, longitude numeric,
  purpose text, property_type text, developer text, price numeric, currency text, bedrooms integer, bathrooms integer,
  size numeric, size_unit text, plot_size numeric, completion_status text, availability text, amenities text[],
  highlights text[], hero_image_url text, hero_video_url text, tour_360_url text, slug text, seo_title text,
  seo_description text, listing_source text, last_refreshed_at timestamp with time zone,
  created_at timestamp with time zone, updated_at timestamp with time zone, country_id uuid, country_name text,
  country_slug text, area_id uuid, area_name text, area_slug text, development_id uuid, development_name text,
  development_slug text, assigned_agent_id uuid, assigned_agent_name text, assigned_agent_avatar text,
  assigned_agent_role text, tower_name text, floor_number text, unit_number text, parking_spaces integer,
  furnishing_status text, available_from date, maids_room boolean, majlis boolean, indoor_majlis boolean,
  outdoor_majlis boolean, cloudflare_video_uid text, cloudflare_video_status text, balcony boolean,
  built_up_area numeric, built_up_area_unit text, title_ar text, description_ar text, seo_title_ar text,
  seo_description_ar text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.title, p.reference_code, p.description, p.location, p.latitude, p.longitude,
    p.purpose,
    -- The website knows one Villa type.
    case when p.property_type in ('Villa Standalone', 'Villa Compound') then 'Villa' else p.property_type end,
    p.developer, p.price, p.currency, p.bedrooms, p.bathrooms,
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
    p.built_up_area, p.built_up_area_unit,
    p.title_ar, p.description_ar, p.seo_title_ar, p.seo_description_ar
  from public.properties p
  left join public.countries c on c.id = p.country_id
  left join public.areas a on a.id = p.area_id
  left join public.developments d on d.id = p.development_id
  left join public.team_members ag on ag.id = p.assigned_agent_id
  where p.is_published = true and p.approval_status = 'approved' and p.status = 'active';
$$;

create or replace function public.match_properties_for_lead(_lead_id uuid, _limit integer default 10)
returns table(property_id uuid, score numeric, reasons text[])
language plpgsql
stable
set search_path = public
as $$
declare
  l record;
begin
  -- Runs as the caller: a lead the caller cannot see is simply not found.
  select * into l from public.leads where id = _lead_id;
  if l is null then return; end if;

  return query
  select
    p.id,
    (
      (case when l.purchase_purpose is not null and p.purpose = l.purchase_purpose then 20 else 0 end)
      + (case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 20 else 0 end)
      + (case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 20 else 0 end)
      + (case when l.preferred_property_types is not null and public.property_type_matches(p.property_type, l.preferred_property_types) then 15 else 0 end)
      + (case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 10 else 0 end)
      + (case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 15 else 0 end)
      + (case when l.development_id is not null and p.development_id = l.development_id then 10 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 'matches preferred country' end,
      case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 'matches preferred area' end,
      case when l.preferred_property_types is not null and public.property_type_matches(p.property_type, l.preferred_property_types) then 'matches property type' end,
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
set search_path = public
as $$
declare
  p record;
begin
  select * into p from public.properties where id = _property_id;
  if p is null then return; end if;

  -- Runs as the caller, so only leads the caller is allowed to see can be matched.
  return query
  select
    l.id,
    (
      (case when l.purchase_purpose is not null and p.purpose = l.purchase_purpose then 20 else 0 end)
      + (case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 20 else 0 end)
      + (case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 20 else 0 end)
      + (case when l.preferred_property_types is not null and public.property_type_matches(p.property_type, l.preferred_property_types) then 15 else 0 end)
      + (case when l.preferred_bedrooms is not null and p.bedrooms = any(l.preferred_bedrooms) then 10 else 0 end)
      + (case when l.budget_min is not null and l.budget_max is not null and p.price is not null
              and p.price between l.budget_min * 0.85 and l.budget_max * 1.15 then 15 else 0 end)
      + (case when l.development_id is not null and p.development_id = l.development_id then 10 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when l.preferred_country_id is not null and p.country_id = l.preferred_country_id then 'matches preferred country' end,
      case when l.preferred_area_id is not null and p.area_id = l.preferred_area_id then 'matches preferred area' end,
      case when l.preferred_property_types is not null and public.property_type_matches(p.property_type, l.preferred_property_types) then 'matches property type' end,
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
  select * into base from public.properties where id = _property_id and is_published = true and approval_status = 'approved';
  if base is null then return; end if;

  return query
  select
    p.id,
    (
      (case when p.purpose = base.purpose then 20 else 0 end)
      + (case when p.country_id = base.country_id then 15 else 0 end)
      + (case when p.area_id = base.area_id then 20 else 0 end)
      + (case when public.property_type_family(p.property_type) = public.property_type_family(base.property_type) then 15 else 0 end)
      + (case when p.bedrooms = base.bedrooms then 10 else 0 end)
      + (case when p.development_id is not null and p.development_id = base.development_id then 15 else 0 end)
      + (case when base.price is not null and p.price is not null
              and p.price between base.price * 0.8 and base.price * 1.2 then 15 else 0 end)
    )::numeric as score,
    array_remove(array[
      case when p.area_id = base.area_id then 'same area' end,
      case when public.property_type_family(p.property_type) = public.property_type_family(base.property_type) then 'same property type' end,
      case when p.development_id is not null and p.development_id = base.development_id then 'same development' end,
      case when base.price is not null and p.price is not null
              and p.price between base.price * 0.8 and base.price * 1.2 then 'similar price range' end
    ], null) as reasons
  from public.properties p
  where p.id <> base.id and p.status = 'active' and p.availability = 'available' and p.is_published = true and p.approval_status = 'approved'
  order by score desc
  limit _limit;
end;
$$;
