-- Owner phone privacy, step 1 of 2 (additive only, changes no existing access).
--
-- An agent may view an owner or a property without being entitled to the owner's
-- raw phone number. Entitlement is decided here, on the server:
--   1. Super Administrator or Administrator role, or an explicit owners.view_phone grant.
--   2. The agent with a real relationship to the owner: assigned to the owner, assigned
--      to or creator of one of the owner's properties, assigned on one of the owner's
--      contracts, or assigned to the lead the owner was converted from.
--
-- Step 2 (20260921000200) removes SELECT on owners.phone from client roles so the
-- raw value can only be obtained through get_owner_phones().

create or replace function public.is_owner_phone_elevated()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select tm.role in ('super_administrator', 'administrator')
       from public.team_members tm
      where tm.user_id = auth.uid() and tm.is_active is true
      limit 1),
    false
  ) or public.has_permission('owners', 'view_phone');
$$;

create or replace function public.can_view_owner_phone(_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null and (
    public.is_owner_phone_elevated()
    or (
      public.current_team_member_id() is not null
      and exists (
        select 1
          from public.owners o
         where o.id = _owner_id
           and (
             o.assigned_agent_id = public.current_team_member_id()
             or exists (
               select 1 from public.properties p
                where p.owner_id = o.id
                  and (
                    p.assigned_agent_id = public.current_team_member_id()
                    or p.created_by = auth.uid()
                    or p.created_by = public.current_team_member_id()
                  )
             )
             or exists (
               select 1 from public.owner_contracts c
                where c.owner_id = o.id
                  and c.assigned_agent_id = public.current_team_member_id()
             )
             or exists (
               select 1 from public.leads l
                where l.id = o.source_lead_id
                  and l.assigned_agent_id = public.current_team_member_id()
             )
           )
      )
    )
  );
$$;

-- Returns phones only for owners the caller is entitled to. Unauthorized owners are
-- simply absent from the result, so the raw value never reaches the client.
create or replace function public.get_owner_phones(_owner_ids uuid[])
returns table (owner_id uuid, phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id, o.phone
    from public.owners o
   where o.id = any(_owner_ids)
     and public.has_permission('owners', 'view')
     and public.can_view_owner_phone(o.id);
$$;

-- Search that respects the same rule: matches on phone only count when the caller is
-- entitled to that owner's phone, so search cannot be used to probe hidden numbers.
create or replace function public.search_owners(_query text, _limit int default 8)
returns table (id uuid, name text, company text, code text, phone text, phone_hidden boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id,
         o.name,
         o.company,
         o.code::text,
         case when public.can_view_owner_phone(o.id) then o.phone else null end,
         not public.can_view_owner_phone(o.id)
    from public.owners o
   where public.has_permission('owners', 'view')
     and length(trim(coalesce(_query, ''))) >= 2
     and (
       o.name ilike '%' || trim(_query) || '%'
       or o.company ilike '%' || trim(_query) || '%'
       or o.code::text ilike '%' || trim(_query) || '%'
       or (public.can_view_owner_phone(o.id) and o.phone ilike '%' || trim(_query) || '%')
     )
   order by o.name
   limit least(coalesce(_limit, 8), 25);
$$;

revoke all on function public.is_owner_phone_elevated() from public, anon;
revoke all on function public.can_view_owner_phone(uuid) from public, anon;
revoke all on function public.get_owner_phones(uuid[]) from public, anon;
revoke all on function public.search_owners(text, int) from public, anon;
grant execute on function public.is_owner_phone_elevated() to authenticated;
grant execute on function public.can_view_owner_phone(uuid) to authenticated;
grant execute on function public.get_owner_phones(uuid[]) to authenticated;
grant execute on function public.search_owners(text, int) to authenticated;
