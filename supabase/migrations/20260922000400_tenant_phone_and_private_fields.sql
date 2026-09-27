-- Tenants: phone is required for new tenants, and the ID / passport number gets a
-- relationship-aware access rule. Additive and safe to apply before the CRM build ships.
--
-- 1. Phone: new tenants must have one (whitespace normalised). Existing tenants without a phone
--    stay valid and can still be edited; only new rows, or removing an existing phone, are
--    rejected. Reuses the enforce_contact_phone() rule already used by leads and owners.
-- 2. created_by: records which staff member created the tenant, so the person who captured an
--    ID can still see it.
-- 3. can_view_tenant_id(): who may read a tenant's ID number. Not copied from the owner rule.
--    A tenant is linked to properties through tenancies, so the relationship is:
--      - Super Administrator or Administrator role, or
--      - the staff member who created the tenant, or
--      - the agent assigned to (or who created) a property this tenant has a tenancy on.
-- 4. get_tenant_private_fields(): the only way the browser gets an ID number, gated by the rule.
-- 5. A write guard so nobody who may not read an ID can overwrite it through a direct update.
--
-- The column-level lockdown that finally stops direct reads of tenants.id_number lives in the
-- next migration and is applied only once the CRM build that reads tenants by explicit columns
-- is deployed (same order used for owners).

alter table public.tenants
  add column if not exists created_by uuid references public.team_members(id) on delete set null;

create or replace function public.tenants_set_created_by()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    new.created_by := public.current_team_member_id();
  end if;
  return new;
end;
$$;

revoke all on function public.tenants_set_created_by() from public, anon, authenticated;

drop trigger if exists tenants_set_created_by on public.tenants;
create trigger tenants_set_created_by
  before insert on public.tenants
  for each row execute function public.tenants_set_created_by();

drop trigger if exists tenants_enforce_phone on public.tenants;
create trigger tenants_enforce_phone
  before insert or update of phone on public.tenants
  for each row execute function public.enforce_contact_phone();

create or replace function public.can_view_tenant_id(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null and (
    coalesce(
      (select tm.role in ('super_administrator', 'administrator')
         from public.team_members tm
        where tm.user_id = auth.uid() and tm.is_active is true
        limit 1),
      false
    )
    or (
      public.current_team_member_id() is not null
      and (
        exists (
          select 1 from public.tenants t
           where t.id = _tenant_id
             and t.created_by = public.current_team_member_id()
        )
        or exists (
          select 1
            from public.property_leases l
            join public.properties p on p.id = l.property_id
           where l.tenant_id = _tenant_id
             and (
               p.assigned_agent_id = public.current_team_member_id()
               or p.created_by = auth.uid()
               or p.created_by = public.current_team_member_id()
             )
        )
      )
    )
  );
$$;

revoke all on function public.can_view_tenant_id(uuid) from public, anon;
grant execute on function public.can_view_tenant_id(uuid) to authenticated;

create or replace function public.get_tenant_private_fields(_tenant_ids uuid[])
returns table (tenant_id uuid, id_number text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.id_number
    from public.tenants t
   where t.id = any(_tenant_ids)
     and public.has_permission('properties', 'view')
     and public.can_view_tenant_id(t.id);
$$;

revoke all on function public.get_tenant_private_fields(uuid[]) from public, anon;
grant execute on function public.get_tenant_private_fields(uuid[]) to authenticated;

create or replace function public.tenants_guard_id_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and new.id_number is distinct from old.id_number
     and not public.can_view_tenant_id(old.id) then
    raise exception 'You do not have access to change this tenant''s ID number'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.tenants_guard_id_number() from public, anon, authenticated;

drop trigger if exists tenants_guard_id_number on public.tenants;
create trigger tenants_guard_id_number
  before update on public.tenants
  for each row execute function public.tenants_guard_id_number();
