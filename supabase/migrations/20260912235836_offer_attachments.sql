-- Offer file attachments, following the existing uploads.<entity>_id pattern
-- already used for lead_id/property_id/owner_id/tenant_id/property_lease_id.
alter table public.uploads add column if not exists offer_id uuid references public.offers(id) on delete cascade;
create index if not exists uploads_offer_id_idx on public.uploads(offer_id);

comment on column public.uploads.offer_id is 'Links a document/image/PDF upload to the Offer it supports.';
