-- Cloudflare Stream video upload. hero_video_url remains as the optional
-- external fallback URL; cloudflare_video_uid is the primary, playable via
-- Stream's HLS/dash endpoints once status = 'ready'.
alter table public.properties
  add column if not exists cloudflare_video_uid text,
  add column if not exists cloudflare_video_status text not null default 'none',
  add column if not exists cloudflare_video_error text;

alter table public.properties drop constraint if exists properties_cloudflare_video_status_check;
alter table public.properties add constraint properties_cloudflare_video_status_check
  check (cloudflare_video_status = any (array['none','uploading','ready','error']::text[]));

comment on column public.properties.cloudflare_video_uid is 'Cloudflare Stream video UID once uploaded.';
comment on column public.properties.hero_video_url is 'Optional external video URL, used as a fallback when no Cloudflare Stream video is set.';
