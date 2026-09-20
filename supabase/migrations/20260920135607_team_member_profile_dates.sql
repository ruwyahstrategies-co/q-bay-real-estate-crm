-- Standard staff profile fields requested by the client: joining date and
-- date of birth. Both optional, additive, no change to auth or existing rows.

alter table public.team_members
  add column if not exists joining_date date,
  add column if not exists date_of_birth date;

alter table public.team_members
  drop constraint if exists team_members_date_of_birth_sane;
alter table public.team_members
  add constraint team_members_date_of_birth_sane
  check (date_of_birth is null or date_of_birth >= date '1900-01-01');

comment on column public.team_members.joining_date is 'Date the staff member joined the company. Optional.';
comment on column public.team_members.date_of_birth is 'Staff member date of birth. Optional.';
