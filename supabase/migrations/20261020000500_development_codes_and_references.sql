-- Property references for developer-owned properties.
--
-- Standard (owner-owned) properties keep their format:  OWNERCODE + AGENTCODE - YY - SEQUENCE
--   e.g. AMMO-26-001
-- A property whose OWNER is a developer (owners.is_developer, the authoritative flag) AND that is linked to
-- a development gets:  DEVELOPMENTCODE + AGENTCODE - YY - SEQUENCE   e.g. BLIMO-26-001
--
-- The development code is a permanent, unique, three-letter code created once per development. It is three
-- letters (owner and agent codes are two) so a development-based prefix can never be mistaken for an
-- owner-based one. Existing references are never rewritten. A developer-owned property with no development
-- (or whose development has no code) simply falls back to the standard owner-based reference.

alter table public.developments add column if not exists code text;

alter table public.developments
  add constraint developments_code_format check (code is null or code ~ '^[A-Z]{3}$');

create unique index if not exists developments_code_key on public.developments (code) where code is not null;

-- Concurrency-safe unique code from a development name (same locking approach as the owner/agent codes).
create or replace function public.assign_development_code(_seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  clean text := upper(regexp_replace(coalesce(_seed, ''), '[^a-zA-Z]', '', 'g'));
  n integer := length(clean);
  cand text;
  i integer;
  j integer;
  k integer;
begin
  perform pg_advisory_xact_lock(hashtext('code_assign_developments'));

  if n >= 3 then
    cand := substr(clean, 1, 3);
    if not exists (select 1 from public.developments where code = cand) then
      return cand;
    end if;
    for i in 2 .. n - 1 loop
      for j in i + 1 .. n loop
        cand := substr(clean, 1, 1) || substr(clean, i, 1) || substr(clean, j, 1);
        if not exists (select 1 from public.developments where code = cand) then
          return cand;
        end if;
      end loop;
    end loop;
  end if;

  if n >= 1 then
    for j in 1 .. 26 loop
      for k in 1 .. 26 loop
        cand := substr(clean, 1, 1) || substr(letters, j, 1) || substr(letters, k, 1);
        if not exists (select 1 from public.developments where code = cand) then
          return cand;
        end if;
      end loop;
    end loop;
  end if;

  for i in 1 .. 26 loop
    for j in 1 .. 26 loop
      for k in 1 .. 26 loop
        cand := substr(letters, i, 1) || substr(letters, j, 1) || substr(letters, k, 1);
        if not exists (select 1 from public.developments where code = cand) then
          return cand;
        end if;
      end loop;
    end loop;
  end loop;

  raise exception 'No available development code remains';
end;
$$;

revoke all on function public.assign_development_code(text) from public, anon, authenticated;

create or replace function public.developments_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or btrim(new.code) = '' then
      new.code := public.assign_development_code(new.name);
    else
      new.code := upper(btrim(new.code));
    end if;
  elsif old.code is not null and new.code is distinct from old.code then
    raise exception 'A development code is permanent and cannot be changed.' using errcode = '23514';
  elsif old.code is null and (new.code is null or btrim(new.code) = '') then
    new.code := public.assign_development_code(new.name);
  end if;
  return new;
end;
$$;

create or replace trigger developments_assign_code
  before insert or update on public.developments
  for each row execute function public.developments_assign_code();

-- Give every existing development its code (oldest first, so the result is deterministic).
do $$
declare
  r record;
begin
  for r in select id, name from public.developments where code is null order by created_at, id loop
    update public.developments set code = public.assign_development_code(r.name) where id = r.id;
  end loop;
end;
$$;

-- One definition of "what prefix does this property get", shared by the real assignment and the preview.
create or replace function public.property_reference_prefix(_owner_id uuid, _agent_id uuid, _development_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_code text;
  v_owner_is_developer boolean;
  v_agent_code text;
  v_dev_code text;
  v_yy text := to_char(now(), 'YY');
begin
  if _owner_id is null or _agent_id is null then
    return null;
  end if;

  select o.code::text, coalesce(o.is_developer, false)
    into v_owner_code, v_owner_is_developer
    from public.owners o where o.id = _owner_id;
  select tm.code::text into v_agent_code from public.team_members tm where tm.id = _agent_id;

  if v_agent_code is null then
    return null;
  end if;

  if v_owner_is_developer and _development_id is not null then
    select d.code into v_dev_code from public.developments d where d.id = _development_id;
    if v_dev_code is not null then
      return v_dev_code || v_agent_code || '-' || v_yy;
    end if;
  end if;

  if v_owner_code is null then
    return null;
  end if;
  return v_owner_code || v_agent_code || '-' || v_yy;
end;
$$;

revoke all on function public.property_reference_prefix(uuid, uuid, uuid) from public, anon;
grant execute on function public.property_reference_prefix(uuid, uuid, uuid) to authenticated;

-- The real assignment. Same locking and counter table as before, and it never overwrites an existing code.
create or replace function public.properties_assign_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  seq int;
begin
  if new.reference_code is not null and new.reference_code <> '' then
    return new;
  end if;

  v_prefix := public.property_reference_prefix(new.owner_id, new.assigned_agent_id, new.development_id);
  if v_prefix is null then
    return new;
  end if;

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

-- Preview shown in the Property drawer. A new name, because adding a parameter to the existing
-- two-argument function would make calls to it ambiguous.
create or replace function public.preview_property_reference_for(_owner_id uuid, _agent_id uuid, _development_id uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.prefix is null then null
           else p.prefix || '-' || lpad((
             coalesce((select c.last_value from public.property_reference_counters c where c.prefix = p.prefix), 0) + 1
           )::text, 3, '0')
         end
    from (select public.property_reference_prefix(_owner_id, _agent_id, _development_id) as prefix) p;
$$;

revoke all on function public.preview_property_reference_for(uuid, uuid, uuid) from public, anon;
grant execute on function public.preview_property_reference_for(uuid, uuid, uuid) to authenticated;

-- The original two-argument preview keeps working for older sessions and now shares the same logic.
create or replace function public.preview_property_reference(_owner_id uuid, _agent_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.preview_property_reference_for(_owner_id, _agent_id, null);
$$;
