-- Property Interests: reliable saving, and a property search that scales to thousands of properties.
--
-- Why selected interests went missing: they were saved by the browser in separate read, insert and delete
-- steps with no uniqueness rule, and a role that may create leads but not edit them (create-only) was
-- blocked by row-level security when it tried to attach properties to the lead it had just created. The
-- table has never held a single row in production. Saving is now one atomic database call, links are
-- unique per lead and property, and the creator of a lead may attach properties to it.

alter table public.lead_property_interests
  add constraint lead_property_interests_lead_property_key unique (lead_id, property_id);

create index if not exists lead_property_interests_lead_idx on public.lead_property_interests (lead_id);
create index if not exists lead_property_interests_property_idx on public.lead_property_interests (property_id);

create or replace function public.lead_created_by_me(_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.leads l where l.id = _lead_id and l.created_by = auth.uid());
$$;

revoke all on function public.lead_created_by_me(uuid) from public, anon;
grant execute on function public.lead_created_by_me(uuid) to authenticated;

-- Creating a lead lets you attach properties to it, even if your role cannot edit other leads.
create policy lead_property_interests_insert_creator on public.lead_property_interests
  for insert to authenticated
  with check (public.has_permission('leads', 'create') and public.lead_created_by_me(lead_id));

-- Replace a lead's interests with exactly this set, atomically. Returns the final list of property ids.
create or replace function public.set_lead_property_interests(_lead_id uuid, _property_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_missing integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to change property interests.' using errcode = '42501';
  end if;
  if not (
    (public.has_permission('leads', 'edit') and public.can_access_lead(_lead_id))
    or (public.has_permission('leads', 'create') and public.lead_created_by_me(_lead_id))
  ) then
    raise exception 'You do not have permission to change this lead''s property interests.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(_property_ids, '{}')) x where x is not null;
  if cardinality(v_ids) > 300 then
    raise exception 'A lead can have at most 300 property interests.' using errcode = '22023';
  end if;

  select count(*) into v_missing from unnest(v_ids) x where not exists (select 1 from public.properties p where p.id = x);
  if v_missing > 0 then
    raise exception '% of the selected properties no longer exist. Refresh and try again.', v_missing using errcode = '22023';
  end if;

  delete from public.lead_property_interests
   where lead_id = _lead_id
     and property_id <> all (v_ids);

  insert into public.lead_property_interests (lead_id, property_id)
  select _lead_id, x from unnest(v_ids) x
  on conflict (lead_id, property_id) do nothing;

  return v_ids;
end;
$$;

revoke all on function public.set_lead_property_interests(uuid, uuid[]) from public, anon;
grant execute on function public.set_lead_property_interests(uuid, uuid[]) to authenticated;

-- Server-side property search for pickers (lead interests, viewings, tasks). One page of results plus the
-- total match count, so the browser never downloads the inventory. SECURITY INVOKER: the caller's own
-- row-level security decides which properties they can see. Properties that are not yet approved are
-- offered only to people who can approve them.
create or replace function public.search_properties_for_picker(
  _query text default null,
  _limit integer default 20,
  _offset integer default 0,
  _purpose text default null
)
returns table (
  id uuid,
  reference_code text,
  title text,
  location text,
  development_name text,
  area_name text,
  price numeric,
  currency text,
  purpose text,
  property_type text,
  bedrooms integer,
  approval_status text,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with q as (
    select
      nullif(btrim(coalesce(_query, '')), '') as term,
      regexp_replace(btrim(coalesce(_query, '')), '([\\%_])', '\\\1', 'g') as pat
  )
  select
    p.id,
    p.reference_code,
    p.title,
    p.location,
    d.name as development_name,
    a.name as area_name,
    p.price,
    p.currency,
    p.purpose,
    p.property_type,
    p.bedrooms,
    p.approval_status,
    count(*) over () as total_count
  from public.properties p
  left join public.developments d on d.id = p.development_id
  left join public.areas a on a.id = p.area_id
  cross join q
  where p.status = 'active'
    and (p.approval_status = 'approved' or public.has_permission('properties', 'approve'))
    and (
      _purpose is null
      or (_purpose = 'rent' and p.purpose = 'rent')
      or (_purpose = 'sale' and p.purpose <> 'rent')
    )
    and (
      q.term is null
      or p.title ilike '%' || q.pat || '%'
      or p.reference_code ilike '%' || q.pat || '%'
      or p.location ilike '%' || q.pat || '%'
      or d.name ilike '%' || q.pat || '%'
      or a.name ilike '%' || q.pat || '%'
      or p.tower_name ilike '%' || q.pat || '%'
      or p.unit_number ilike '%' || q.pat || '%'
    )
  order by
    (q.term is not null and p.reference_code ilike q.pat || '%') desc,
    p.created_at desc,
    p.id
  limit least(greatest(coalesce(_limit, 20), 1), 50)
  offset greatest(coalesce(_offset, 0), 0);
$$;

revoke all on function public.search_properties_for_picker(text, integer, integer, text) from public, anon;
grant execute on function public.search_properties_for_picker(text, integer, integer, text) to authenticated;

-- Indexes for the Properties list filters (price range, agent, area, country / place, approval).
create index if not exists properties_price_idx on public.properties (price);
create index if not exists properties_purpose_status_idx on public.properties (purpose, status);
