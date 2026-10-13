-- Admin-managed Developer / Company master data.
--
-- Until now developments.developer, properties.developer and owners.company were free
-- text, so the same developer existed as "TAAMEER", "Taameer " and "Taameer". This adds ONE
-- small approved-values table (kind = 'developer' | 'company') and an optional link column
-- on each record. Additive only:
--   * the legacy text columns stay and stay populated (public_developments(),
--     public_properties(), search_owners(), exports and the website keep reading them);
--   * nothing is dropped or renamed; unmatched legacy text is never erased;
--   * a trigger keeps text and link in step, and rejects new free-form values.
--
-- Who manages values: has_permission('settings', 'manage'), the same gate Channels and
-- Form Inputs use. Every authenticated staff member can read the list (forms need it).

-- =============================================================================
-- 1. master_data_values
-- =============================================================================

create table if not exists public.master_data_values (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('developer', 'company')),
  name text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_data_values_name_not_blank check (length(btrim(name)) > 0)
);

-- Case/whitespace-insensitive normalisation used for matching and uniqueness.
create or replace function public.master_data_norm(_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(_value, '')), '\s+', ' ', 'g'));
$$;

create unique index if not exists master_data_values_kind_name_key
  on public.master_data_values (kind, public.master_data_norm(name));
create index if not exists master_data_values_kind_order_idx
  on public.master_data_values (kind, display_order, name);

drop trigger if exists master_data_values_set_updated_at on public.master_data_values;
create trigger master_data_values_set_updated_at
  before update on public.master_data_values
  for each row execute function public.set_updated_at();

alter table public.master_data_values enable row level security;
revoke all on public.master_data_values from anon;

drop policy if exists master_data_values_select on public.master_data_values;
create policy master_data_values_select on public.master_data_values
  for select to authenticated using (true);

drop policy if exists master_data_values_write on public.master_data_values;
create policy master_data_values_write on public.master_data_values
  for all to authenticated
  using (public.has_permission('settings', 'manage'))
  with check (public.has_permission('settings', 'manage'));

-- =============================================================================
-- 2. Link columns (nullable). on delete restrict: a value that is in use can only be
--    deactivated, never deleted out from under existing records.
-- =============================================================================

alter table public.developments
  add column if not exists developer_id uuid references public.master_data_values(id) on delete restrict;
alter table public.properties
  add column if not exists developer_id uuid references public.master_data_values(id) on delete restrict;
alter table public.owners
  add column if not exists company_id uuid references public.master_data_values(id) on delete restrict;

create index if not exists developments_developer_id_idx on public.developments (developer_id);
create index if not exists properties_developer_id_idx on public.properties (developer_id);
create index if not exists owners_company_id_idx on public.owners (company_id);

-- owners uses column-level privileges (phone / id_number are locked down), so a new
-- column is not readable until it is granted. company_id is not private.
grant select (company_id), insert (company_id), update (company_id)
  on public.owners to authenticated;

-- =============================================================================
-- 3. Backfill: seed approved values from the data already there, then link records.
--    Spelling variants collapse to the most common spelling (ties: alphabetical).
--    The generic triggers on these tables are paused for the backfill so it does not
--    bump updated_at, fire notifications or touch anything except the two columns.
-- =============================================================================

with src as (
  select btrim(developer) as v from public.developments where nullif(btrim(developer), '') is not null
  union all
  select btrim(developer) from public.properties where nullif(btrim(developer), '') is not null
),
ranked as (
  select public.master_data_norm(v) as k, v, count(*) as n from src group by 1, 2
),
pick as (
  select distinct on (k) k, v from ranked order by k, n desc, v
)
insert into public.master_data_values (kind, name, display_order)
select 'developer', v, (row_number() over (order by lower(v)))::int
from pick
on conflict do nothing;

with src as (
  select btrim(company) as v from public.owners
  where nullif(btrim(company), '') is not null
    and btrim(company) !~ '^[-–—.\s]+$'   -- placeholder dashes are not companies
),
ranked as (
  select public.master_data_norm(v) as k, v, count(*) as n from src group by 1, 2
),
pick as (
  select distinct on (k) k, v from ranked order by k, n desc, v
)
insert into public.master_data_values (kind, name, display_order)
select 'company', v, (row_number() over (order by lower(v)))::int
from pick
on conflict do nothing;

alter table public.developments disable trigger user;
alter table public.properties disable trigger user;
alter table public.owners disable trigger user;

update public.developments d
   set developer_id = m.id, developer = m.name
  from public.master_data_values m
 where m.kind = 'developer'
   and d.developer_id is null
   and public.master_data_norm(d.developer) = public.master_data_norm(m.name);

update public.properties p
   set developer_id = m.id, developer = m.name
  from public.master_data_values m
 where m.kind = 'developer'
   and p.developer_id is null
   and public.master_data_norm(p.developer) = public.master_data_norm(m.name);

update public.owners o
   set company_id = m.id, company = m.name
  from public.master_data_values m
 where m.kind = 'company'
   and o.company_id is null
   and public.master_data_norm(o.company) = public.master_data_norm(m.name);

alter table public.developments enable trigger user;
alter table public.properties enable trigger user;
alter table public.owners enable trigger user;

-- =============================================================================
-- 4. Enforcement. Runs on insert, and on update only when one of the two columns is
--    written. Rules for a signed-in user (admins included; they add values in Settings):
--      * selecting a value by id: must exist, be the right kind, and be active
--        (re-saving a record that already points at a now-inactive value is fine);
--      * writing text: must match an approved value (it is then linked and written in
--        its canonical spelling); anything else is rejected;
--      * text and link both unchanged: untouched, so legacy values survive edits.
--    Service role / system jobs (no auth.uid()) are not blocked: text that matches is
--    linked, text that does not is kept as-is with no link.
-- =============================================================================

create or replace function public.enforce_master_data_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  txt_col text := tg_argv[0];
  id_col text := tg_argv[1];
  v_kind text := tg_argv[2];
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  new_id uuid := nullif(n ->> id_col, '')::uuid;
  old_id uuid := nullif(o ->> id_col, '')::uuid;
  new_txt text := nullif(btrim(n ->> txt_col), '');
  old_txt text := nullif(btrim(o ->> txt_col), '');
  enforcing boolean := auth.uid() is not null;
  id_changed boolean;
  txt_changed boolean;
  rec public.master_data_values%rowtype;
begin
  id_changed := new_id is distinct from old_id;
  txt_changed := new_txt is distinct from old_txt;

  -- 1. A value was picked by id.
  if new_id is not null and id_changed then
    select * into rec from public.master_data_values where id = new_id and kind = v_kind;
    if not found then
      raise exception 'Unknown approved % value.', v_kind using errcode = '23503';
    end if;
    if enforcing and not rec.is_active then
      raise exception '% "%" is inactive and cannot be selected. Ask an administrator to reactivate it.',
        initcap(v_kind), rec.name using errcode = '23514';
    end if;
    new := jsonb_populate_record(new, jsonb_build_object(txt_col, rec.name, id_col, rec.id));
    return new;
  end if;

  -- 2. Nothing about this reference changed: keep whatever is stored (legacy text included).
  if not id_changed and not txt_changed then
    return new;
  end if;

  -- 3. Cleared.
  if new_txt is null then
    new := jsonb_populate_record(new, jsonb_build_object(txt_col, null, id_col, null));
    return new;
  end if;

  -- 4. Free text was written: it must resolve to an approved value.
  select * into rec
    from public.master_data_values
   where kind = v_kind and public.master_data_norm(name) = public.master_data_norm(new_txt)
   order by is_active desc
   limit 1;
  if found then
    if enforcing and not rec.is_active and rec.id is distinct from old_id then
      raise exception '% "%" is inactive and cannot be selected. Ask an administrator to reactivate it.',
        initcap(v_kind), rec.name using errcode = '23514';
    end if;
    new := jsonb_populate_record(new, jsonb_build_object(txt_col, rec.name, id_col, rec.id));
    return new;
  end if;

  if enforcing then
    raise exception '"%" is not an approved %. Choose one from the list; administrators add new values in Settings.',
      new_txt, v_kind using errcode = '23514';
  end if;

  new := jsonb_populate_record(new, jsonb_build_object(id_col, null));
  return new;
end;
$$;

drop trigger if exists developments_enforce_developer on public.developments;
create trigger developments_enforce_developer
  before insert or update of developer, developer_id on public.developments
  for each row execute function public.enforce_master_data_ref('developer', 'developer_id', 'developer');

drop trigger if exists properties_enforce_developer on public.properties;
create trigger properties_enforce_developer
  before insert or update of developer, developer_id on public.properties
  for each row execute function public.enforce_master_data_ref('developer', 'developer_id', 'developer');

drop trigger if exists owners_enforce_company on public.owners;
create trigger owners_enforce_company
  before insert or update of company, company_id on public.owners
  for each row execute function public.enforce_master_data_ref('company', 'company_id', 'company');

-- =============================================================================
-- 5. Renaming an approved value keeps the legacy text columns (and so the public
--    website, exports and owner search) in step with it.
-- =============================================================================

create or replace function public.propagate_master_data_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;
  if new.kind = 'developer' then
    update public.developments set developer = new.name
     where developer_id = new.id and developer is distinct from new.name;
    update public.properties set developer = new.name
     where developer_id = new.id and developer is distinct from new.name;
  else
    update public.owners set company = new.name
     where company_id = new.id and company is distinct from new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists master_data_values_propagate_rename on public.master_data_values;
create trigger master_data_values_propagate_rename
  after update of name on public.master_data_values
  for each row execute function public.propagate_master_data_rename();
