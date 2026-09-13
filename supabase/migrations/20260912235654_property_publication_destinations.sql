-- Independent per-destination publication state. QBay visibility continues to
-- be governed by the existing properties.is_published boolean; Mazad Qatar and
-- Property Finder each get their own status/lifecycle columns so publishing to
-- one destination is never conflated with another.
alter table public.properties
  add column if not exists mazad_status text not null default 'not_configured',
  add column if not exists mazad_synced_at timestamptz,
  add column if not exists mazad_error text,
  add column if not exists mazad_external_id text,
  add column if not exists property_finder_status text not null default 'not_configured',
  add column if not exists property_finder_synced_at timestamptz,
  add column if not exists property_finder_error text,
  add column if not exists property_finder_external_id text;

alter table public.properties drop constraint if exists properties_mazad_status_check;
alter table public.properties add constraint properties_mazad_status_check
  check (mazad_status = any (array['not_configured','queued','published','failed','unpublished']::text[]));

alter table public.properties drop constraint if exists properties_property_finder_status_check;
alter table public.properties add constraint properties_property_finder_status_check
  check (property_finder_status = any (array['not_configured','queued','published','failed','unpublished']::text[]));

comment on column public.properties.mazad_status is 'Independent publication state for Mazad Qatar destination; QBay uses is_published, Property Finder uses property_finder_status.';
comment on column public.properties.property_finder_status is 'Independent publication state for Property Finder destination.';
