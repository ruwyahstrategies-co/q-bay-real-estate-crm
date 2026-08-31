-- The public Journal filters articles by category (Market Insights, Area
-- Guide, Design, Investment, ...); blog_posts had no such column.
alter table public.blog_posts add column category text;

create or replace view public.public_blog_posts as
select
  b.id, b.title, b.slug, b.content, b.excerpt, b.featured_image, b.published_at,
  b.seo_title, b.seo_description,
  ag.full_name as author_name, ag.avatar_url as author_avatar,
  b.category
from public.blog_posts b
left join public.team_members ag on ag.id = b.author_id
where b.is_published = true;

grant select on public.public_blog_posts to anon, authenticated;
