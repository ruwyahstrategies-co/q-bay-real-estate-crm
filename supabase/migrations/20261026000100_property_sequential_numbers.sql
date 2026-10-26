-- Property numbers: one permanent, sequential number per property (001, 002, 003 ...).
--
-- The number is independent of the owner and of the assigned agent, so changing either never touches it. The
-- owner and agent based reference code stays exactly as issued (nothing is rewritten); the number is a second,
-- simpler handle that staff, PDFs and exports use.
--
--   * Gapless and safe under concurrent saves: a single counter row is incremented inside the inserting
--     transaction. A second insert waits for the first to commit, so two properties can never share a number,
--     and a rolled back insert gives its number back.
--   * Never reused: the counter only moves forward, so a deleted property's number is not issued again.
--   * Permanent: once issued it cannot be changed by staff (a Super Administrator can still correct one
--     deliberately). A number sent by the browser on insert is ignored.
--   * Existing properties are numbered 001 upward in the order they were created.

create table if not exists public.property_number_counter (
  id smallint primary key default 1 check (id = 1),
  last_value integer not null default 0
);
alter table public.property_number_counter enable row level security;
revoke all on public.property_number_counter from public, anon, authenticated;

alter table public.properties add column if not exists property_number integer;

-- Number the existing properties by creation order. User triggers are off for this one statement so the
-- backfill does not write approval history, marketing requests or new updated_at stamps.
alter table public.properties disable trigger user;

with ordered as (
  select id,
         row_number() over (order by created_at, id)
           + (select coalesce(max(property_number), 0) from public.properties) as n
  from public.properties
  where property_number is null
)
update public.properties p
   set property_number = ordered.n
  from ordered
 where p.id = ordered.id;

alter table public.properties enable trigger user;

insert into public.property_number_counter (id, last_value)
  values (1, (select coalesce(max(property_number), 0) from public.properties))
  on conflict (id) do update
    set last_value = greatest(public.property_number_counter.last_value, excluded.last_value);

alter table public.properties
  add constraint properties_property_number_positive check (property_number is null or property_number > 0);

create unique index if not exists properties_property_number_key
  on public.properties (property_number);

-- The number as staff read it (001, 002 ... 1000). Stored so it can be searched and exported as plain text.
alter table public.properties
  add column if not exists property_number_label text
  generated always as (lpad(property_number::text, 3, '0')) stored;

create or replace function public.properties_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- A system write (restore or migration tooling, no signed-in user) may carry its own number; the counter
  -- then moves past it. Everyone else always receives the next number, whatever the browser sent.
  if new.property_number is not null and auth.uid() is null then
    update public.property_number_counter
       set last_value = greatest(last_value, new.property_number)
     where id = 1;
    return new;
  end if;

  update public.property_number_counter
     set last_value = last_value + 1
   where id = 1
  returning last_value into n;

  new.property_number := n;
  return new;
end;
$$;

create or replace trigger properties_assign_number
  before insert on public.properties
  for each row execute function public.properties_assign_number();

-- A number, once issued, stays. Only a Super Administrator (or a system write) can correct one.
create or replace function public.properties_protect_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.property_number is distinct from old.property_number
     and auth.uid() is not null
     and not public.is_super_administrator() then
    raise exception 'A property number is permanent and cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger properties_protect_number
  before update of property_number on public.properties
  for each row execute function public.properties_protect_number();

revoke execute on function public.properties_assign_number() from public, anon, authenticated;
revoke execute on function public.properties_protect_number() from public, anon, authenticated;
