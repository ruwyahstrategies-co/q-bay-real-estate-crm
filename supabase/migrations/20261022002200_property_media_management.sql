-- Property images: one reliable way to add, order, choose the hero of, and remove a property's photos.
--
-- What was wrong (found in the live data):
--   * The Edit Property drawer's "Hero image" uploader saved the file and tagged it with the property, but never
--     added it to the property's gallery (property_media). The photo then showed in the Uploads module and not in
--     the property's Media section. 18 uploads were in that state.
--   * New photos took their position from a stale in-browser count, so every property's gallery had repeated
--     positions (68 properties), which made "move left/right" swap two equal numbers and do nothing.
--   * The hero was kept in two places (a flag on the gallery row and a URL on the property) that drifted apart.
--
-- What this does:
--   1. Repairs the data without deleting anything: links the 18 orphaned uploads to their property, renumbers
--      each gallery 0..n-1 keeping the order it had, and marks the gallery row that matches a property's hero URL
--      as its hero. Nothing about what the public website shows changes.
--   2. Adds functions that do the work on the server in one step each (with a lock per property so two uploads
--      at once cannot collide): add_property_media, set_property_hero, reorder_property_media,
--      remove_property_media. They run with the caller's own permissions.
--   3. Adds two guards: at most one hero per property, and one gallery row per photo per property.

-- 1a. Link uploads that belong to a property but were never added to its gallery.
insert into public.property_media (property_id, upload_id, media_type, display_order)
select u.property_id, u.id, 'image',
       1000000 + (row_number() over (partition by u.property_id order by u.created_at, u.id))::int
  from public.uploads u
 where u.category = 'property_media'
   and u.property_id is not null
   and coalesce(u.mime_type, '') like 'image/%'
   and exists (select 1 from public.properties p where p.id = u.property_id)
   and not exists (select 1 from public.property_media m where m.upload_id = u.id);

-- 1b. Renumber every gallery 0..n-1 in the order it already had.
with ranked as (
  select id,
         (row_number() over (partition by property_id order by display_order, created_at, id) - 1)::int as rn
    from public.property_media
)
update public.property_media m
   set display_order = r.rn
  from ranked r
 where r.id = m.id and m.display_order is distinct from r.rn;

-- 1c. Where a property's hero URL is one of its gallery photos and no photo is marked hero, mark that one.
update public.property_media m
   set is_hero = true
  from public.uploads u, public.properties p
 where u.id = m.upload_id
   and p.id = m.property_id
   and p.hero_image_url is not null
   and u.public_url = p.hero_image_url
   and not exists (select 1 from public.property_media h where h.property_id = m.property_id and h.is_hero)
   and m.id = (
     select m2.id
       from public.property_media m2
       join public.uploads u2 on u2.id = m2.upload_id
      where m2.property_id = m.property_id and u2.public_url = p.hero_image_url
      order by m2.display_order, m2.id
      limit 1
   );

-- 3. Guards.
create unique index if not exists property_media_one_hero
  on public.property_media (property_id) where is_hero;
create unique index if not exists property_media_one_row_per_upload
  on public.property_media (property_id, upload_id) where upload_id is not null;

-- 2. Functions. Security invoker: row access and permissions are the caller's own.

create or replace function public.set_property_hero(_media_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  m public.property_media;
  v_url text;
begin
  select * into m from public.property_media where id = _media_id;
  if not found then
    raise exception 'That photo could not be found.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('property_media_' || m.property_id::text));

  update public.property_media set is_hero = false where property_id = m.property_id and is_hero and id <> _media_id;
  update public.property_media set is_hero = true where id = _media_id;

  -- The property keeps its own copy of the hero address for the website; it follows the gallery.
  select u.public_url into v_url from public.uploads u where u.id = m.upload_id;
  if v_url is not null then
    update public.properties set hero_image_url = v_url where id = m.property_id;
  end if;
end;
$$;

create or replace function public.add_property_media(_property_id uuid, _upload_id uuid, _make_hero boolean default false)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_upload public.uploads;
  v_id uuid;
  v_order int;
  v_has_hero boolean;
begin
  if not (public.has_permission('uploads', 'upload') or public.has_permission('properties', 'edit')) then
    raise exception 'You do not have permission to add photos to a property.' using errcode = '42501';
  end if;

  select * into v_upload from public.uploads where id = _upload_id;
  if not found then
    raise exception 'That upload could not be found.' using errcode = '22023';
  end if;
  if v_upload.category <> 'property_media' or coalesce(v_upload.mime_type, '') not like 'image/%' then
    raise exception 'Only images can be added to a property gallery.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.properties where id = _property_id) then
    raise exception 'That property could not be found.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('property_media_' || _property_id::text));

  -- Adding the same photo twice returns the row it already has.
  select id into v_id from public.property_media where property_id = _property_id and upload_id = _upload_id;
  if v_id is not null then
    if _make_hero then perform public.set_property_hero(v_id); end if;
    return v_id;
  end if;

  select coalesce(max(display_order) + 1, 0) into v_order from public.property_media where property_id = _property_id;
  select exists (select 1 from public.property_media where property_id = _property_id and is_hero) into v_has_hero;

  insert into public.property_media (property_id, upload_id, media_type, display_order, is_hero)
  values (_property_id, _upload_id, 'image', v_order, false)
  returning id into v_id;

  -- The first photo of a property becomes its hero; later ones only when asked.
  if _make_hero or not v_has_hero then
    perform public.set_property_hero(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.reorder_property_media(_property_id uuid, _ordered_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('property_media_' || _property_id::text));

  with wanted as (
    select t.id, t.ord::bigint as ord
      from unnest(_ordered_ids) with ordinality as t(id, ord)
     where exists (select 1 from public.property_media pm where pm.id = t.id and pm.property_id = _property_id)
  ),
  rest as (
    select pm.id, 1000000 + row_number() over (order by pm.display_order, pm.created_at, pm.id) as ord
      from public.property_media pm
     where pm.property_id = _property_id
       and not exists (select 1 from wanted w where w.id = pm.id)
  ),
  merged as (
    select id, ord from wanted union all select id, ord from rest
  ),
  ranked as (
    select id, (row_number() over (order by ord) - 1)::int as rn from merged
  )
  update public.property_media m
     set display_order = r.rn
    from ranked r
   where r.id = m.id and m.display_order is distinct from r.rn;
end;
$$;

-- Takes a photo out of the gallery and returns its upload id so the file itself can be deleted. If it was the
-- hero, the next photo becomes the hero (or the property's hero address is cleared when none is left).
create or replace function public.remove_property_media(_media_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  m public.property_media;
  v_url text;
  v_next uuid;
begin
  select * into m from public.property_media where id = _media_id;
  if not found then
    raise exception 'That photo could not be found.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('property_media_' || m.property_id::text));

  select u.public_url into v_url from public.uploads u where u.id = m.upload_id;
  delete from public.property_media where id = _media_id;

  with ranked as (
    select id, (row_number() over (order by display_order, created_at, id) - 1)::int as rn
      from public.property_media where property_id = m.property_id
  )
  update public.property_media pm set display_order = r.rn from ranked r where r.id = pm.id and pm.display_order is distinct from r.rn;

  if m.is_hero then
    select id into v_next from public.property_media where property_id = m.property_id order by display_order limit 1;
    if v_next is not null then
      perform public.set_property_hero(v_next);
    elsif v_url is not null then
      update public.properties set hero_image_url = null where id = m.property_id and hero_image_url = v_url;
    end if;
  end if;

  return m.upload_id;
end;
$$;

grant execute on function public.set_property_hero(uuid) to authenticated;
grant execute on function public.add_property_media(uuid, uuid, boolean) to authenticated;
grant execute on function public.reorder_property_media(uuid, uuid[]) to authenticated;
grant execute on function public.remove_property_media(uuid) to authenticated;
revoke execute on function public.set_property_hero(uuid) from anon, public;
revoke execute on function public.add_property_media(uuid, uuid, boolean) from anon, public;
revoke execute on function public.reorder_property_media(uuid, uuid[]) from anon, public;
revoke execute on function public.remove_property_media(uuid) from anon, public;
