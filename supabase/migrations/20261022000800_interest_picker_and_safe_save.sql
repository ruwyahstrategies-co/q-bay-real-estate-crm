-- Property interests: a picker that only offers what can still be sold or rented, and a save that is safe
-- with reservations and closed deals.
--
--   * The picker no longer offers a property that is already sold or rented. A property the lead already
--     chose stays selected (it is shown from its own record, not from this search).
--   * Saving a lead's interests replaces the list, but an interest that is part of a closed deal (won)
--     cannot be removed, and removing an interest that is holding a property as Reserved releases that
--     reservation (unless another lead is also holding it).

create or replace function public.search_properties_for_picker(
  _query text default null,
  _limit integer default 20,
  _offset integer default 0,
  _purpose text default null
)
returns table(
  id uuid, reference_code text, title text, location text, development_name text, area_name text,
  price numeric, currency text, purpose text, property_type text, bedrooms integer,
  approval_status text, total_count bigint
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
    and p.availability not in ('sold', 'rented')
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

create or replace function public.set_lead_property_interests(_lead_id uuid, _property_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_missing integer;
  v_won text;
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

  -- A property in a closed deal stays linked to the lead.
  select p.title into v_won
    from public.lead_property_interests i
    join public.properties p on p.id = i.property_id
   where i.lead_id = _lead_id and i.status = 'won' and i.property_id <> all (v_ids)
   limit 1;
  if v_won is not null then
    raise exception '% is part of a closed deal for this lead and cannot be removed from it.', v_won using errcode = '23514';
  end if;

  -- Removing an interest that holds a property as Reserved lets the property go (unless another lead holds it too).
  update public.properties p
     set availability = 'available'
   where p.availability = 'reserved'
     and exists (select 1 from public.lead_property_interests i
                  where i.lead_id = _lead_id and i.property_id = p.id and i.holds_property and i.property_id <> all (v_ids))
     and not exists (select 1 from public.lead_property_interests o
                      where o.property_id = p.id and o.holds_property and o.lead_id <> _lead_id and o.status = 'reserved');

  delete from public.lead_property_interests
   where lead_id = _lead_id
     and property_id <> all (v_ids);

  insert into public.lead_property_interests (lead_id, property_id)
  select _lead_id, x from unnest(v_ids) x
  on conflict (lead_id, property_id) do nothing;

  return v_ids;
end;
$$;
