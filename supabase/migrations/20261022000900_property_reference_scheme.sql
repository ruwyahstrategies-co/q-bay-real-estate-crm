-- Property references: owner and agent based, never development based.
--
-- Every property reference is  OWNERCODE + AGENTCODE - YY - SEQUENCE  (for example AAMO-26-002), built from the
-- property's owner and its assigned agent. The development code is no longer part of a reference. A property
-- that belongs to a development keeps its development link and its existing reference: nothing already issued
-- is rewritten, and the development code column itself is left in place.
--
--   * Unique: a unique index on reference_code already guarantees it, and the sequence below skips any number
--     that is somehow taken instead of failing the save.
--   * Safe sequencing: one advisory lock per prefix plus a counter row, so two properties saved at the same
--     moment can never receive the same number.
--   * Stable: once a property has a reference, it cannot be changed by staff (a Super Administrator can still
--     correct one deliberately).

create or replace function public.property_reference_prefix(_owner_id uuid, _agent_id uuid, _development_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_code text;
  v_agent_code text;
begin
  if _owner_id is null or _agent_id is null then
    return null;
  end if;

  select o.code::text into v_owner_code from public.owners o where o.id = _owner_id;
  select tm.code::text into v_agent_code from public.team_members tm where tm.id = _agent_id;

  if v_owner_code is null or v_agent_code is null then
    return null;
  end if;
  return v_owner_code || v_agent_code || '-' || to_char(now(), 'YY');
end;
$$;

create or replace function public.properties_assign_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  seq int;
  v_try int := 0;
begin
  if new.reference_code is not null and new.reference_code <> '' then
    return new;
  end if;

  v_prefix := public.property_reference_prefix(new.owner_id, new.assigned_agent_id, null);
  if v_prefix is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('property_ref_' || v_prefix));

  loop
    insert into public.property_reference_counters (prefix, last_value, updated_at)
      values (v_prefix, 1, now())
      on conflict (prefix) do update
        set last_value = public.property_reference_counters.last_value + 1,
            updated_at = now()
      returning last_value into seq;

    new.reference_code := v_prefix || '-' || lpad(seq::text, 3, '0');
    exit when not exists (select 1 from public.properties p where p.reference_code = new.reference_code);

    v_try := v_try + 1;
    if v_try > 1000 then
      raise exception 'Could not find a free property reference for %', v_prefix;
    end if;
  end loop;
  return new;
end;
$$;

-- A reference, once issued, stays. Only a Super Administrator (or a system write) can correct one.
create or replace function public.properties_protect_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.reference_code is not null and old.reference_code <> ''
     and new.reference_code is distinct from old.reference_code
     and auth.uid() is not null
     and not public.is_super_administrator() then
    raise exception 'A property reference is permanent and cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger properties_protect_reference
  before update of reference_code on public.properties
  for each row execute function public.properties_protect_reference();

revoke execute on function public.properties_protect_reference() from public, anon, authenticated;
