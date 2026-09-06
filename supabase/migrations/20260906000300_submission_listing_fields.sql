-- Public "list your property" submissions carry the same unit-identity fields
-- as the Sale Listing Form, so converting a submission into a property is a
-- straight copy rather than a re-key.
alter table public.property_submissions
  add column if not exists tower_name text,
  add column if not exists floor_number text,
  add column if not exists unit_number text,
  add column if not exists parking_spaces integer,
  add column if not exists furnishing_status text,
  add column if not exists owner_id_number text;

alter table public.property_submissions drop constraint if exists property_submissions_furnishing_status_check;
alter table public.property_submissions
  add constraint property_submissions_furnishing_status_check
  check (furnishing_status is null or furnishing_status in ('FF', 'SF', 'UF'));
