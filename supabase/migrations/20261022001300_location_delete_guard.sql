-- Deleting a location only when nothing uses it.
--
-- Before this, deleting a Country also deleted its Areas, and deleting any location quietly blanked the
-- location on every property, lead, development and website submission that pointed at it. Now:
--
--   * location_usage(kind, id) says what still uses a location (for the Settings screen to show).
--   * A delete trigger on countries, areas and places refuses while anything uses the row, whoever asks
--     (Settings, the API, a script). The row can be deactivated instead, which hides it from new records
--     and keeps every existing link.
--   * Both read every record, not only the ones the caller can see, so a restricted user cannot delete a
--     location that other people's records depend on.

create or replace function public.location_usage(_kind text, _id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb := '{}'::jsonb;
  n bigint;
begin
  if auth.uid() is not null and not public.has_permission('locations', 'manage') then
    raise exception 'You do not have permission to manage locations.' using errcode = '42501';
  end if;

  if _kind = 'country' then
    select count(*) into n from public.areas where country_id = _id;
    if n > 0 then r := r || jsonb_build_object('areas', n); end if;
    select count(*) into n from public.properties where country_id = _id;
    if n > 0 then r := r || jsonb_build_object('properties', n); end if;
    select count(*) into n from public.leads where preferred_country_id = _id;
    if n > 0 then r := r || jsonb_build_object('leads', n); end if;
    select count(*) into n from public.developments where country_id = _id;
    if n > 0 then r := r || jsonb_build_object('developments', n); end if;
    select count(*) into n from public.property_submissions where country_id = _id;
    if n > 0 then r := r || jsonb_build_object('website submissions', n); end if;
  elsif _kind = 'area' then
    select count(*) into n from public.places where area_id = _id;
    if n > 0 then r := r || jsonb_build_object('places', n); end if;
    select count(*) into n from public.properties where area_id = _id;
    if n > 0 then r := r || jsonb_build_object('properties', n); end if;
    select count(*) into n from public.leads where preferred_area_id = _id;
    if n > 0 then r := r || jsonb_build_object('leads', n); end if;
    select count(*) into n from public.developments where area_id = _id;
    if n > 0 then r := r || jsonb_build_object('developments', n); end if;
    select count(*) into n from public.property_submissions where area_id = _id;
    if n > 0 then r := r || jsonb_build_object('website submissions', n); end if;
  elsif _kind = 'place' then
    select count(*) into n from public.properties where place_id = _id;
    if n > 0 then r := r || jsonb_build_object('properties', n); end if;
    select count(*) into n from public.leads where preferred_place_id = _id;
    if n > 0 then r := r || jsonb_build_object('leads', n); end if;
    select count(*) into n from public.developments where place_id = _id;
    if n > 0 then r := r || jsonb_build_object('developments', n); end if;
    select count(*) into n from public.property_submissions where place_id = _id;
    if n > 0 then r := r || jsonb_build_object('website submissions', n); end if;
  else
    raise exception 'Unknown location kind %', _kind;
  end if;
  return r;
end;
$$;

grant execute on function public.location_usage(text, uuid) to authenticated;
revoke execute on function public.location_usage(text, uuid) from anon, public;

create or replace function public.location_block_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := tg_argv[0];
  v_usage jsonb;
  v_text text;
begin
  v_usage := public.location_usage(v_kind, old.id);
  if v_usage <> '{}'::jsonb then
    select string_agg(value || ' ' || key, ', ' order by key) into v_text from jsonb_each_text(v_usage);
    raise exception 'Cannot delete "%": it is still used by %. Deactivate it instead, or move those records first.', old.name, v_text
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.location_block_delete() from public, anon, authenticated;

create or replace trigger countries_block_delete
  before delete on public.countries
  for each row execute function public.location_block_delete('country');

create or replace trigger areas_block_delete
  before delete on public.areas
  for each row execute function public.location_block_delete('area');

create or replace trigger places_block_delete
  before delete on public.places
  for each row execute function public.location_block_delete('place');
