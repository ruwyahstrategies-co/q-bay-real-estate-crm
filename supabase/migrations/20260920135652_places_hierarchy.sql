-- Country -> Area -> Place hierarchy. Adds a third level (places) without
-- touching countries or areas, plus nullable place references on every record
-- that already carries an area. Existing rows keep place_id = null and keep
-- working exactly as before.

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete restrict,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists places_area_slug_key on public.places (area_id, slug);
create unique index if not exists places_area_name_key on public.places (area_id, lower(btrim(name)));
create index if not exists places_area_idx on public.places (area_id);

drop trigger if exists places_set_updated_at on public.places;
create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

alter table public.places enable row level security;

drop policy if exists places_select_staff on public.places;
create policy places_select_staff on public.places
  for select to authenticated using (true);

drop policy if exists places_write on public.places;
create policy places_write on public.places
  for all to authenticated
  using (has_permission('locations', 'manage'))
  with check (has_permission('locations', 'manage'));

-- Nullable place references (never forced).
alter table public.properties
  add column if not exists place_id uuid references public.places(id) on delete set null;
alter table public.developments
  add column if not exists place_id uuid references public.places(id) on delete set null;
alter table public.leads
  add column if not exists preferred_place_id uuid references public.places(id) on delete set null;
alter table public.property_submissions
  add column if not exists place_id uuid references public.places(id) on delete set null;

create index if not exists properties_place_idx on public.properties (place_id) where place_id is not null;
create index if not exists developments_place_idx on public.developments (place_id) where place_id is not null;
create index if not exists leads_preferred_place_idx on public.leads (preferred_place_id) where preferred_place_id is not null;
create index if not exists property_submissions_place_idx on public.property_submissions (place_id) where place_id is not null;

-- Keep the hierarchy consistent: when a place is set, any country/area on the
-- same row must be the place's own area and country. Null area/country stays
-- allowed so old rows and partially filled forms are never rejected.
-- TG_ARGV = country column, area column, place column.
create or replace function public.enforce_place_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v_country uuid := nullif(j ->> tg_argv[0], '')::uuid;
  v_area uuid := nullif(j ->> tg_argv[1], '')::uuid;
  v_place uuid := nullif(j ->> tg_argv[2], '')::uuid;
  p_area uuid;
  p_country uuid;
begin
  if v_place is null then
    return new;
  end if;
  select pl.area_id, a.country_id into p_area, p_country
    from public.places pl join public.areas a on a.id = pl.area_id
   where pl.id = v_place;
  if p_area is null then
    raise exception 'Selected place does not exist';
  end if;
  if v_area is not null and v_area <> p_area then
    raise exception 'Selected place does not belong to the selected area';
  end if;
  if v_country is not null and v_country <> p_country then
    raise exception 'Selected place does not belong to the selected country';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_place_hierarchy() from public, anon, authenticated;

drop trigger if exists properties_enforce_place on public.properties;
create trigger properties_enforce_place
  before insert or update of country_id, area_id, place_id on public.properties
  for each row execute function public.enforce_place_hierarchy('country_id', 'area_id', 'place_id');

drop trigger if exists developments_enforce_place on public.developments;
create trigger developments_enforce_place
  before insert or update of country_id, area_id, place_id on public.developments
  for each row execute function public.enforce_place_hierarchy('country_id', 'area_id', 'place_id');

drop trigger if exists leads_enforce_place on public.leads;
create trigger leads_enforce_place
  before insert or update of preferred_country_id, preferred_area_id, preferred_place_id on public.leads
  for each row execute function public.enforce_place_hierarchy('preferred_country_id', 'preferred_area_id', 'preferred_place_id');

drop trigger if exists property_submissions_enforce_place on public.property_submissions;
create trigger property_submissions_enforce_place
  before insert or update of country_id, area_id, place_id on public.property_submissions
  for each row execute function public.enforce_place_hierarchy('country_id', 'area_id', 'place_id');

-- Data correction: a row named "the pearl island" was entered as a COUNTRY, but
-- it is an area inside Qatar. It is only reclassified when it is provably
-- unused (no areas, properties, developments, leads or submissions point at
-- it). Nothing is deleted: the mistaken country row is deactivated so it
-- disappears from public lists and can be removed manually later.
do $$
declare
  v_bad uuid;
  v_qatar uuid;
begin
  select id into v_bad from public.countries
   where slug = 'the-pearl-island' and lower(btrim(name)) = 'the pearl island';
  select id into v_qatar from public.countries where slug = 'qatar';
  if v_bad is null or v_qatar is null then
    return;
  end if;
  if exists (select 1 from public.areas where country_id = v_bad)
     or exists (select 1 from public.properties where country_id = v_bad)
     or exists (select 1 from public.developments where country_id = v_bad)
     or exists (select 1 from public.leads where preferred_country_id = v_bad)
     or exists (select 1 from public.property_submissions where country_id = v_bad) then
    return;
  end if;

  insert into public.areas (country_id, name, slug, is_active, display_order)
  select v_qatar, 'The Pearl Island', 'the-pearl-island', true,
         coalesce(max(display_order) + 1, 0)
    from public.areas where country_id = v_qatar
  on conflict (country_id, slug) do nothing;

  update public.countries set is_active = false where id = v_bad;
end;
$$;
