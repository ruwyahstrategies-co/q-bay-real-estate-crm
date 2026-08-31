-- Website needs to know a brochure exists (to show "Request Brochure") without
-- ever seeing the private upload id/path itself.
create or replace view public.public_developments as
select
  d.id, d.name, d.slug, d.developer, d.description, d.status, d.latitude, d.longitude,
  d.hero_image_url, d.hero_video_url, d.tour_360_url, d.property_types, d.price_from,
  d.price_to, d.currency, d.amenities, d.payment_plan, d.unit_mix, d.completion_status,
  d.delivery_timeline, d.seo_title, d.seo_description, d.created_at, d.updated_at,
  d.country_id, c.name as country_name, c.slug as country_slug,
  d.area_id, a.name as area_name, a.slug as area_slug,
  d.assigned_agent_id, ag.full_name as assigned_agent_name, ag.avatar_url as assigned_agent_avatar,
  (d.brochure_upload_id is not null) as has_brochure
from public.developments d
left join public.countries c on c.id = d.country_id
left join public.areas a on a.id = d.area_id
left join public.team_members ag on ag.id = d.assigned_agent_id
where d.is_published = true;

grant select on public.public_developments to anon, authenticated;
