-- Owner search must follow owner visibility.
--
-- Found by the cross-agent test: search_owners and search_owner_ids run as the database owner and only checked
-- the role permission, so any agent could find another agent's owner by typing a name. Both now return only
-- owners the person may open (developer records, owners they created, and owners they may see the phone of).
-- A phone number still only counts as a match for owners whose phone the person is entitled to see.

create or replace function public.search_owner_ids(_query text, _limit integer default 300)
returns table(owner_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with q as (
    select
      btrim(coalesce(_query, '')) as raw,
      regexp_replace(btrim(coalesce(_query, '')), '([\\%_])', '\\\1', 'g') as pat,
      regexp_replace(coalesce(_query, ''), '\D', '', 'g') as digits,
      btrim(coalesce(_query, '')) ~ '^[+0-9 ()./-]+$' as looks_like_phone
  )
  select o.id
    from public.owners o
   cross join q
   where public.has_permission('owners', 'view')
     -- Only owners this person may open (the same rule as the owners list).
     and (o.is_developer is true or o.created_by = auth.uid() or public.can_view_owner_phone(o.id))
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
$function$;

create or replace function public.search_owners(_query text, _limit integer default 8)
returns table(id uuid, name text, company text, code text, phone text, phone_hidden boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.id,
         o.name,
         o.company,
         o.code::text,
         case when public.can_view_owner_phone(o.id) then o.phone else null end,
         not public.can_view_owner_phone(o.id)
    from public.owners o
   where public.has_permission('owners', 'view')
     -- Only owners this person may open (the same rule as the owners list).
     and (o.is_developer is true or o.created_by = auth.uid() or public.can_view_owner_phone(o.id))
     and o.status = 'active'
     and length(trim(coalesce(_query, ''))) >= 2
     and (
       o.name ilike '%' || trim(_query) || '%'
       or o.company ilike '%' || trim(_query) || '%'
       or o.code::text ilike '%' || trim(_query) || '%'
       or (public.can_view_owner_phone(o.id) and o.phone ilike '%' || trim(_query) || '%')
     )
   order by o.name
   limit least(coalesce(_limit, 8), 25);
$function$;
