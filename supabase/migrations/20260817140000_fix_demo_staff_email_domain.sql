-- Corrects the placeholder domain used in the demo staff seed data
-- (20260817120200_demo_seed_data.sql), which was already applied live with
-- @qbay.qa email addresses. This is a data-only fix (no schema change) for
-- the three fixed demo staff rows — new forward migration rather than
-- editing the already-applied seed migration, since that wouldn't change
-- what's already live.

update public.team_members
set email = replace(email, '@qbay.qa', '@qbayrealestate.com')
where id in (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103'
)
and email like '%@qbay.qa';
