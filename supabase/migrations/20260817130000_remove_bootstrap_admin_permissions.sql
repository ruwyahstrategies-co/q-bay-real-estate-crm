-- Remove the bootstrap-admin fallback from the permission engine.
--
-- The original `current_team_permissions()` (applied in
-- 20260817002611_...sql) treated any authenticated user with no linked
-- team_members row as a full-access administrator. That was only ever
-- needed to bootstrap the very first admin login before any staff row
-- existed. A real, linked, active administrator
-- (omar@ruwyahstrategies.com) now exists, so this fallback must be removed:
-- an authenticated-but-unlinked or inactive caller must get NO permissions.
--
-- This is a NEW forward migration — it does not edit the already-applied
-- 20260817002611 migration file, it replaces the function it created.
-- Safe to re-run (CREATE OR REPLACE).

create or replace function public.current_team_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then '{}'::jsonb
    when tm.id is null then '{}'::jsonb
    when tm.is_active is false then '{}'::jsonb
    else coalesce(tm.permissions, '{}'::jsonb)
  end
  from (select 1) as _dummy
  left join public.team_members tm on tm.user_id = auth.uid()
  limit 1;
$$;

-- has_permission() is unchanged in shape/signature — it already just reads
-- current_team_permissions(), so no update needed there. Re-affirm grants
-- for clarity/idempotency.
grant execute on function public.current_team_permissions() to authenticated, service_role;
grant execute on function public.has_permission(text, text) to authenticated, service_role;
