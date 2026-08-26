-- Q-Bay Real Estate CRM — baseline seed data (organisation + core locations).
-- No demo leads/properties/staff here — this project starts genuinely empty
-- of business data; only the reference data the UI needs to function.

insert into public.organisations (name, default_currency, timezone)
values ('Q-Bay Real Estate', 'QAR', 'Asia/Qatar');

with org as (select id from public.organisations limit 1)
insert into public.countries (name, code, slug, display_order)
values
  ('Qatar', 'QA', 'qatar', 0),
  ('United Arab Emirates', 'AE', 'uae', 1);

with qatar as (select id from public.countries where slug = 'qatar'),
     uae as (select id from public.countries where slug = 'uae')
insert into public.areas (country_id, name, slug, display_order)
select id, name, slug, display_order from (
  select (select id from qatar) as id, 'Lusail Marina' as name, 'lusail-marina' as slug, 0 as display_order
  union all select (select id from qatar), 'The Pearl-Qatar', 'the-pearl-qatar', 1
  union all select (select id from qatar), 'West Bay', 'west-bay', 2
  union all select (select id from qatar), 'Msheireb Downtown', 'msheireb-downtown', 3
  union all select (select id from qatar), 'Al Waab', 'al-waab', 4
  union all select (select id from uae), 'Downtown Dubai', 'downtown-dubai', 0
  union all select (select id from uae), 'Dubai Marina', 'dubai-marina', 1
  union all select (select id from uae), 'Palm Jumeirah', 'palm-jumeirah', 2
) seed;
