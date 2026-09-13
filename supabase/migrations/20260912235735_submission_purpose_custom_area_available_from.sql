-- List Your Property: exact Sell / Rent / Let purpose (never collapsed),
-- a custom free-text area alongside the canonical area_id (public users never
-- write into the canonical Areas table directly), and Available From.
alter table public.property_submissions drop constraint if exists property_submissions_purpose_check;
alter table public.property_submissions add constraint property_submissions_purpose_check
  check (purpose is null or purpose = any (array['sell','rent','let']::text[]));

alter table public.property_submissions
  add column if not exists custom_area text,
  add column if not exists available_from date;

comment on column public.property_submissions.custom_area is 'Free-text area typed by the public submitter when no canonical Area matched; area_id stays null in that case until CRM staff normalise it.';
comment on column public.property_submissions.available_from is 'Carried into properties.available_from on Convert To Property.';
