-- Booking Form and Reservation Form records for an offer.
--
-- A row is the saved snapshot of the values printed on a form (so the same form can be regenerated
-- exactly), plus the link to the generated PDF and to the signed copy that staff upload back.
-- Both PDFs are ordinary rows in public.uploads (private storage, category offer_attachments, tied to
-- the offer), so they follow the existing upload permissions and appear in the offer's attachments.
--
-- Visibility follows the offer: whoever can read an offer can read its forms. The offers policies are
-- evaluated inside the subquery, so an agent never sees a form for another agent's offer.

create table if not exists public.offer_forms (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  form_type text not null check (form_type in ('booking', 'reservation')),
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check (status in ('generated', 'signed', 'void')),
  generated_upload_id uuid references public.uploads (id) on delete set null,
  signed_upload_id uuid references public.uploads (id) on delete set null,
  generated_by uuid default public.current_team_member_id() references public.team_members (id) on delete set null,
  generated_at timestamptz not null default now(),
  signed_by uuid references public.team_members (id) on delete set null,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offer_forms_offer_idx on public.offer_forms (offer_id, generated_at desc);
create index if not exists offer_forms_lead_idx on public.offer_forms (lead_id);

create or replace trigger set_updated_at
  before update on public.offer_forms
  for each row execute function public.set_updated_at();

-- A form can only point at files that belong to its own offer, and a signed copy must exist.
create or replace function public.offer_forms_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer uuid;
begin
  if new.generated_upload_id is not null then
    select offer_id into v_offer from public.uploads where id = new.generated_upload_id;
    if v_offer is distinct from new.offer_id then
      raise exception 'The generated file does not belong to this offer.' using errcode = '22023';
    end if;
  end if;

  if new.signed_upload_id is not null then
    select offer_id into v_offer from public.uploads where id = new.signed_upload_id;
    if v_offer is distinct from new.offer_id then
      raise exception 'The signed file does not belong to this offer.' using errcode = '22023';
    end if;
    if new.status = 'generated' then
      new.status := 'signed';
    end if;
    if new.signed_at is null then
      new.signed_at := now();
      new.signed_by := coalesce(new.signed_by, public.current_team_member_id());
    end if;
  elsif new.status = 'signed' then
    raise exception 'Upload the signed copy before marking this form signed.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace trigger offer_forms_validate
  before insert or update on public.offer_forms
  for each row execute function public.offer_forms_validate();

revoke execute on function public.offer_forms_validate() from public, anon, authenticated;

alter table public.offer_forms enable row level security;

create policy offer_forms_select on public.offer_forms
  for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_forms.offer_id));

create policy offer_forms_insert on public.offer_forms
  for insert to authenticated
  with check (
    (public.has_permission('offers', 'create') or public.has_permission('offers', 'edit'))
    and exists (select 1 from public.offers o where o.id = offer_forms.offer_id)
    and generated_by is not distinct from public.current_team_member_id()
  );

create policy offer_forms_update on public.offer_forms
  for update to authenticated
  using (
    (public.has_permission('offers', 'create') or public.has_permission('offers', 'edit'))
    and exists (select 1 from public.offers o where o.id = offer_forms.offer_id)
  )
  with check (
    (public.has_permission('offers', 'create') or public.has_permission('offers', 'edit'))
    and exists (select 1 from public.offers o where o.id = offer_forms.offer_id)
  );

create policy offer_forms_delete on public.offer_forms
  for delete to authenticated
  using (public.has_permission('offers', 'delete'));

revoke all on public.offer_forms from anon, authenticated;
grant select, insert, update, delete on public.offer_forms to authenticated;
