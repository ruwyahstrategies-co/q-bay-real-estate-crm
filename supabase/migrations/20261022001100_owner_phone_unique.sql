-- One owner per phone number, enforced by the database.
--
-- Two numbers count as the same when they have the same digits once spaces, "+", dashes and the Qatar
-- country code are ignored ("+974 5571 7247", "5571 7247" and "55717247" are one number). The rule holds
-- whoever writes the record: CRM staff, lead conversion, imports and the website listing form.
--
--   * A trigger gives staff a clear message and serialises two saves of the same number made at the same
--     moment. It reads every owner (not only the ones the caller can see), so an agent cannot create a
--     duplicate of an owner that belongs to someone else.
--   * A unique index is the hard backstop underneath it.
--   * Two pairs of owners already shared a number before this rule existed. They are not merged or changed:
--     the later record of each pair is flagged, which keeps it out of the index until someone gives it its
--     own number (the flag clears itself when the phone changes). Nothing else about those owners moves.

alter table public.owners
  add column if not exists phone_duplicate_acknowledged boolean not null default false;

-- The comparison key for a phone number: digits only, without a 00 prefix or the Qatar +974 code.
create or replace function public.owner_phone_key(_phone text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when d like '974%' and length(d) = 11 then substr(d, 4)
      when d like '00%' and length(d) >= 10 then
        case when substr(d, 3) like '974%' and length(substr(d, 3)) = 11 then substr(d, 6) else substr(d, 3) end
      else d
    end,
    ''
  )
  from (select regexp_replace(coalesce(_phone, ''), '\D', '', 'g') as d) s;
$$;

-- Flag the later record of each pair that already shares a number.
with ranked as (
  select id,
         row_number() over (partition by public.owner_phone_key(phone) order by created_at, id) as rn
    from public.owners
   where public.owner_phone_key(phone) is not null
)
update public.owners o
   set phone_duplicate_acknowledged = true
  from ranked r
 where r.id = o.id and r.rn > 1;

create unique index if not exists owners_phone_key_unique
  on public.owners (public.owner_phone_key(phone))
  where public.owner_phone_key(phone) is not null and not phone_duplicate_acknowledged;

create or replace function public.owners_enforce_unique_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.owner_phone_key(new.phone);
begin
  if tg_op = 'UPDATE' and v_key is not distinct from public.owner_phone_key(old.phone) then
    return new;
  end if;

  -- A new number starts a clean slate for the legacy flag.
  new.phone_duplicate_acknowledged := false;
  if v_key is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('owner_phone_' || v_key));

  if exists (
    select 1 from public.owners o
     where o.id is distinct from new.id
       and public.owner_phone_key(o.phone) = v_key
  ) then
    raise exception 'An owner with this phone number already exists. Open that owner instead of creating a new one.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

-- Runs after the phone has been tidied by owners_enforce_phone (triggers fire in name order).
create or replace trigger owners_unique_phone
  before insert or update of phone on public.owners
  for each row execute function public.owners_enforce_unique_phone();

revoke execute on function public.owners_enforce_unique_phone() from public, anon, authenticated;
