-- Off-Plan as a distinct property purpose (kept separate from off_plan_resale),
-- plus Apartment/Villa-specific conditional fields and Available From.
alter table public.properties drop constraint if exists properties_purpose_check;
alter table public.properties add constraint properties_purpose_check
  check (purpose = any (array['sale','rent','commercial','off_plan_resale','off_plan']::text[]));

alter table public.properties
  add column if not exists maids_room boolean,
  add column if not exists majlis boolean,
  add column if not exists indoor_majlis boolean,
  add column if not exists outdoor_majlis boolean,
  add column if not exists available_from date;

comment on column public.properties.maids_room is 'Apartment-specific: maid''s room present.';
comment on column public.properties.majlis is 'Villa-specific: majlis present.';
comment on column public.properties.indoor_majlis is 'Villa-specific: indoor majlis present.';
comment on column public.properties.outdoor_majlis is 'Villa-specific: outdoor majlis present.';
comment on column public.properties.available_from is 'Date the property becomes available; carried over from property_submissions on conversion.';
