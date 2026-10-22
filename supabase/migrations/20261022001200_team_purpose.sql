-- What a team is for, in the team's own words (for example "Off-plan sales for Lusail"). Optional, up to 500 characters.
alter table public.teams
  add column if not exists purpose text;

alter table public.teams
  add constraint teams_purpose_length check (purpose is null or char_length(purpose) <= 500);
