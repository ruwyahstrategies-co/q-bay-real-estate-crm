-- Owner private fields (phone + id_number) share one access rule: can_view_owner_phone().
-- Additive: adds a combined read RPC and a write guard. Changes no existing access.

create or replace function public.get_owner_private_fields(_owner_ids uuid[])
returns table (owner_id uuid, phone text, id_number text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.id, o.phone, o.id_number
    from public.owners o
   where o.id = any(_owner_ids)
     and public.has_permission('owners', 'view')
     and public.can_view_owner_phone(o.id);
$$;

revoke all on function public.get_owner_private_fields(uuid[]) from public, anon;
grant execute on function public.get_owner_private_fields(uuid[]) to authenticated;

-- A user who may not read an owner's phone or id_number may not overwrite them either,
-- so private fields cannot be blindly replaced through a direct API update.
-- Service role and server-side code (auth.uid() is null) are not affected.
create or replace function public.owners_guard_private_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and (new.phone is distinct from old.phone or new.id_number is distinct from old.id_number)
     and not public.can_view_owner_phone(old.id) then
    raise exception 'You do not have access to change this owner''s private contact details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.owners_guard_private_fields() from public, anon, authenticated;

drop trigger if exists owners_guard_private_fields on public.owners;
create trigger owners_guard_private_fields
  before update on public.owners
  for each row execute function public.owners_guard_private_fields();
