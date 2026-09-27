-- Owners page search: name, company, code, email and (only where allowed) phone number.
--
-- owners.phone is not readable by client roles. This function lets the Owners page find
-- owners by phone without ever handing a number to the browser or acting as a lookup oracle:
-- the phone clause is evaluated per owner and only counts when can_view_owner_phone(owner)
-- is true for the caller. A hidden owner cannot be discovered by typing their number.
--
-- It returns matching owner ids only. The page then loads those rows through the existing
-- explicit-column select, so every other privacy rule keeps applying.

create or replace function public.search_owner_ids(_query text, _limit integer default 300)
returns table (owner_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with q as (
    select
      btrim(coalesce(_query, '')) as raw,
      -- escape LIKE wildcards typed by the user
      regexp_replace(btrim(coalesce(_query, '')), '([\\%_])', '\\\1', 'g') as pat,
      regexp_replace(coalesce(_query, ''), '\D', '', 'g') as digits,
      btrim(coalesce(_query, '')) ~ '^[+0-9 ()./-]+$' as looks_like_phone
  )
  select o.id
    from public.owners o
   cross join q
   where public.has_permission('owners', 'view')
     and length(q.raw) >= 1
     and (
       o.name ilike '%' || q.pat || '%'
       or o.company ilike '%' || q.pat || '%'
       or o.email ilike '%' || q.pat || '%'
       or o.code::text ilike '%' || q.pat || '%'
       or (
         q.looks_like_phone
         and length(q.digits) >= 3
         and public.can_view_owner_phone(o.id)
         and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') like '%' || q.digits || '%'
       )
     )
   order by o.name
   limit least(greatest(coalesce(_limit, 300), 1), 500);
$$;

revoke all on function public.search_owner_ids(text, integer) from public, anon;
grant execute on function public.search_owner_ids(text, integer) to authenticated;
