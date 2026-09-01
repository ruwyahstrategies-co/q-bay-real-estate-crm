-- Q-Bay Real Estate CRM — client-review pass, foundation migration.
--
-- 1. Permanent unique 2-letter codes for team_members (agents) and owners.
-- 2. Concurrency-safe, auto-generated property reference codes
--    (OWNER_CODE + AGENT_CODE + "-" + YY + "-" + sequential), preserving any
--    existing manually-entered reference_code values untouched.
-- 3. "off_plan_resale" as a property purpose.
-- 4. Owner-profile groundwork: owners.code/is_developer/address/assigned_agent_id,
--    plus owner_id links on interactions/tasks/uploads so Owner Profiles can
--    show real communication/follow-up/document history instead of nothing.

-- =============================================================================
-- 1. Two-letter code generator (shared by team_members and owners)
-- =============================================================================

create or replace function public.assign_two_letter_code(_table text, _seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  clean text := upper(regexp_replace(coalesce(_seed, ''), '[^a-zA-Z]', '', 'g'));
  candidate text;
  taken boolean;
  i int;
  j int;
begin
  -- Serialize code assignment per table so two concurrent inserts can never
  -- both pick the same free candidate before either commits.
  perform pg_advisory_xact_lock(hashtext('code_assign_' || _table));

  if length(clean) >= 2 then
    candidate := substr(clean, 1, 2);
    execute format('select exists(select 1 from public.%I where code = $1)', _table) into taken using candidate;
    if not taken then return candidate; end if;
  end if;

  if length(clean) >= 1 then
    for j in 2..greatest(length(clean), 1) loop
      exit when j > length(clean);
      candidate := substr(clean, 1, 1) || substr(clean, j, 1);
      execute format('select exists(select 1 from public.%I where code = $1)', _table) into taken using candidate;
      if not taken then return candidate; end if;
    end loop;
  end if;

  for i in 1..26 loop
    for j in 1..26 loop
      candidate := substr(letters, i, 1) || substr(letters, j, 1);
      execute format('select exists(select 1 from public.%I where code = $1)', _table) into taken using candidate;
      if not taken then return candidate; end if;
    end loop;
  end loop;

  raise exception 'No available two-letter code remains for table %', _table;
end;
$$;

revoke execute on function public.assign_two_letter_code(text, text) from public, anon, authenticated;
grant execute on function public.assign_two_letter_code(text, text) to service_role;

-- --- team_members.code --------------------------------------------------

alter table public.team_members add column if not exists code char(2);
create unique index if not exists team_members_code_key on public.team_members (code);

create or replace function public.team_members_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null then
    new.code := public.assign_two_letter_code('team_members', new.full_name);
  else
    new.code := upper(new.code);
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_assign_code on public.team_members;
create trigger team_members_assign_code
  before insert on public.team_members
  for each row execute function public.team_members_assign_code();

-- --- owners.code ---------------------------------------------------------

alter table public.owners add column if not exists code char(2);
alter table public.owners add column if not exists is_developer boolean not null default false;
alter table public.owners add column if not exists address text;
alter table public.owners add column if not exists assigned_agent_id uuid references public.team_members(id) on delete set null;
create unique index if not exists owners_code_key on public.owners (code);
create index if not exists owners_assigned_agent_id_idx on public.owners (assigned_agent_id);

create or replace function public.owners_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null then
    new.code := public.assign_two_letter_code('owners', new.name);
  else
    new.code := upper(new.code);
  end if;
  return new;
end;
$$;

drop trigger if exists owners_assign_code on public.owners;
create trigger owners_assign_code
  before insert on public.owners
  for each row execute function public.owners_assign_code();

-- --- Backfill codes for any pre-existing rows -----------------------------

do $$
declare r record;
begin
  for r in select id, full_name from public.team_members where code is null order by created_at loop
    update public.team_members set code = public.assign_two_letter_code('team_members', r.full_name) where id = r.id;
  end loop;
  for r in select id, name from public.owners where code is null order by created_at loop
    update public.owners set code = public.assign_two_letter_code('owners', r.name) where id = r.id;
  end loop;
end $$;

-- =============================================================================
-- 2. Property reference generator
--    Format: OWNER_CODE + AGENT_CODE + "-" + YY + "-" + sequential (per prefix)
--    e.g. OWAG-26-001. Generated only once both Owner and Assigned Agent are
--    set; existing manually-entered reference_code values are never touched.
-- =============================================================================

create table if not exists public.property_reference_counters (
  prefix text primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.property_reference_counters enable row level security;
-- No client policy: only reached via the security-definer trigger/RPC below.

create unique index if not exists properties_reference_code_key
  on public.properties (reference_code) where reference_code is not null;

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
  prefix text;
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

  prefix := owner_code || agent_code || '-' || yy;
  perform pg_advisory_xact_lock(hashtext('property_ref_' || prefix));

  insert into public.property_reference_counters (prefix, last_value, updated_at)
    values (prefix, 1, now())
    on conflict (prefix) do update
      set last_value = public.property_reference_counters.last_value + 1,
          updated_at = now()
    returning last_value into seq;

  new.reference_code := prefix || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists properties_assign_reference_insert on public.properties;
create trigger properties_assign_reference_insert
  before insert on public.properties
  for each row execute function public.properties_assign_reference();

drop trigger if exists properties_assign_reference_update on public.properties;
create trigger properties_assign_reference_update
  before update on public.properties
  for each row
  when (new.reference_code is null and new.owner_id is not null and new.assigned_agent_id is not null)
  execute function public.properties_assign_reference();

-- Non-incrementing preview for the Property form (shows the *likely* next
-- reference; the real one is only reserved on save).
create or replace function public.preview_property_reference(_owner_id uuid, _agent_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.code is null or tm.code is null then null
    else o.code || tm.code || '-' || to_char(now(), 'YY') || '-' || lpad((
      coalesce((
        select last_value from public.property_reference_counters
        where prefix = o.code || tm.code || '-' || to_char(now(), 'YY')
      ), 0) + 1
    )::text, 3, '0')
  end
  from public.owners o, public.team_members tm
  where o.id = _owner_id and tm.id = _agent_id;
$$;

revoke execute on function public.preview_property_reference(uuid, uuid) from public, anon;
grant execute on function public.preview_property_reference(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- 3. Off-Plan Resale property purpose
-- =============================================================================

alter table public.properties drop constraint if exists properties_purpose_check;
alter table public.properties add constraint properties_purpose_check
  check (purpose in ('sale', 'rent', 'commercial', 'off_plan_resale'));

-- =============================================================================
-- 4. Owner-linked interactions / tasks / uploads (communication + follow-up +
--    document history for Owner Profiles). Existing lead-linked behaviour is
--    unchanged — these columns are purely additive.
-- =============================================================================

alter table public.interactions add column if not exists owner_id uuid references public.owners(id) on delete cascade;
alter table public.tasks add column if not exists owner_id uuid references public.owners(id) on delete cascade;
alter table public.uploads add column if not exists owner_id uuid references public.owners(id) on delete set null;

create index if not exists interactions_owner_id_idx on public.interactions (owner_id);
create index if not exists tasks_owner_id_idx on public.tasks (owner_id);
create index if not exists uploads_owner_id_idx on public.uploads (owner_id);

-- Extend RLS so owner-linked rows are visible under the existing 'owners'/'view'
-- permission (mirrors the lead-scoped branches already in place).

drop policy if exists interactions_select on public.interactions;
create policy interactions_select on public.interactions for select to authenticated using (
  public.has_permission('conversations', 'view_all')
  or created_by = auth.uid()
  or (owner_id is not null and public.has_permission('owners', 'view'))
  or exists (select 1 from public.leads l where l.id = interactions.lead_id and (
    (public.has_permission('conversations', 'view_team') and l.team_id = public.current_team_id())
    or (public.has_permission('conversations', 'view') and l.assigned_agent_id = public.current_team_member_id())
  ))
);

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (
  public.has_permission('tasks', 'view_all')
  or (owner_id is not null and public.has_permission('owners', 'view'))
  or (public.has_permission('tasks', 'view_team') and exists (select 1 from public.team_members tm where tm.id = tasks.assigned_to and tm.team_id = public.current_team_id()))
  or (public.has_permission('tasks', 'view') and assigned_to = public.current_team_member_id())
);
