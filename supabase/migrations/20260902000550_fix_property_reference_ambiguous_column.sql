-- Fix: the plpgsql variable "prefix" collided with the ON CONFLICT target
-- column of the same name, which Postgres resolves ambiguously. This broke
-- reference-code generation for the second-and-later property from the same
-- owner+agent in the same year (the exact case that matters for K).
create or replace function public.properties_assign_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_code text;
  agent_code text;
  yy text := to_char(now(), 'YY');
  v_prefix text;
  seq int;
begin
  if new.reference_code is not null and new.reference_code <> '' then
    return new;
  end if;
  if new.owner_id is null or new.assigned_agent_id is null then
    return new;
  end if;

  select code into owner_code from public.owners where id = new.owner_id;
  select code into agent_code from public.team_members where id = new.assigned_agent_id;
  if owner_code is null or agent_code is null then
    return new;
  end if;

  v_prefix := owner_code || agent_code || '-' || yy;
  perform pg_advisory_xact_lock(hashtext('property_ref_' || v_prefix));

  insert into public.property_reference_counters (prefix, last_value, updated_at)
    values (v_prefix, 1, now())
    on conflict (prefix) do update
      set last_value = public.property_reference_counters.last_value + 1,
          updated_at = now()
    returning last_value into seq;

  new.reference_code := v_prefix || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

revoke execute on function public.properties_assign_reference() from public, anon, authenticated;
