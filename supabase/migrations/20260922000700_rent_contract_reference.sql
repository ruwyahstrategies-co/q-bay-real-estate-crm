-- Rent Contract as a first-class part of a tenancy (property_leases). No second lease system.
--
-- Already there: property, tenant, start/end dates, rent, currency, deposit, payment frequency,
-- status, renewal state, and contract_upload_id (the signed contract). Added here:
--   * contract_number: the contract / tenancy reference. Staff can type their own; when left
--     empty a reference like RC-2026-0001 is generated. Unique so two tenancies never share one.
--   * notes: free notes about the contract.
--   * a real foreign key from contract_upload_id to uploads, so the signed Rent Contract link
--     cannot dangle (removing the upload just clears the link).
-- The signed file itself stays in the private tenant-documents storage. Nothing here makes a
-- contract public.

alter table public.property_leases
  add column if not exists contract_number text,
  add column if not exists notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_leases_contract_upload_id_fkey') then
    alter table public.property_leases
      add constraint property_leases_contract_upload_id_fkey
      foreign key (contract_upload_id) references public.uploads(id) on delete set null;
  end if;
end $$;

create sequence if not exists public.property_lease_contract_seq;

create or replace function public.property_leases_assign_contract_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.contract_number := nullif(btrim(coalesce(new.contract_number, '')), '');
  if new.contract_number is null then
    new.contract_number := 'RC-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.property_lease_contract_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

revoke all on function public.property_leases_assign_contract_number() from public, anon, authenticated;

drop trigger if exists property_leases_assign_contract_number on public.property_leases;
create trigger property_leases_assign_contract_number
  before insert on public.property_leases
  for each row execute function public.property_leases_assign_contract_number();

-- Give any existing tenancy a reference too (there are none in production today).
update public.property_leases
   set contract_number = 'RC-' || to_char(created_at, 'YYYY') || '-'
         || lpad(nextval('public.property_lease_contract_seq')::text, 4, '0')
 where contract_number is null;

create unique index if not exists property_leases_contract_number_uniq
  on public.property_leases (lower(btrim(contract_number)))
  where contract_number is not null;
