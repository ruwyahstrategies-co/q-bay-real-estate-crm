-- Website-facing editorial content for area landing pages. All nullable and
-- staff-optional: the website falls back to neutral copy when empty rather
-- than fabricating marketing claims.
alter table public.areas
  add column tagline text,
  add column lifestyle text,
  add column blurb text,
  add column about text,
  add column hero_image_url text;
