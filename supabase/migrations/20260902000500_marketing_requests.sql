-- Q-Bay Real Estate CRM — Marketing Team module (module D).
-- A marketing_requests row surfaces automatically when a Property is
-- created without a hero image, and auto-resolves the moment the property
-- gets a hero image or its first gallery photo. Marketing staff can also
-- manually assign/progress/complete a request.

create table public.marketing_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  assigned_to uuid references public.team_members(id) on delete set null,
  notes text,
  required_media text not null default 'Hero image + gallery photos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index marketing_requests_open_per_property
  on public.marketing_requests (property_id) where status in ('pending', 'in_progress');
create index marketing_requests_status_idx on public.marketing_requests (status);
create index marketing_requests_property_id_idx on public.marketing_requests (property_id);

drop trigger if exists set_updated_at on public.marketing_requests;
create trigger set_updated_at before update on public.marketing_requests for each row execute function public.set_updated_at();

create or replace function public.properties_create_marketing_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hero_image_url is null or new.hero_image_url = '' then
    insert into public.marketing_requests (property_id, status)
    values (new.id, 'pending')
    on conflict (property_id) where status in ('pending', 'in_progress') do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.properties_create_marketing_request() from public, anon, authenticated;

drop trigger if exists properties_create_marketing_request on public.properties;
create trigger properties_create_marketing_request
  after insert on public.properties
  for each row execute function public.properties_create_marketing_request();

create or replace function public.properties_resolve_marketing_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.hero_image_url is null or old.hero_image_url = '') and new.hero_image_url is not null and new.hero_image_url <> '' then
    update public.marketing_requests
      set status = 'completed', resolved_at = now()
      where property_id = new.id and status in ('pending', 'in_progress');
  end if;
  return new;
end;
$$;

revoke execute on function public.properties_resolve_marketing_request() from public, anon, authenticated;

drop trigger if exists properties_resolve_marketing_request on public.properties;
create trigger properties_resolve_marketing_request
  after update on public.properties
  for each row execute function public.properties_resolve_marketing_request();

create or replace function public.property_media_resolve_marketing_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.media_type = 'image' then
    update public.marketing_requests
      set status = 'completed', resolved_at = now()
      where property_id = new.property_id and status in ('pending', 'in_progress');
  end if;
  return new;
end;
$$;

revoke execute on function public.property_media_resolve_marketing_request() from public, anon, authenticated;

drop trigger if exists property_media_resolve_marketing_request on public.property_media;
create trigger property_media_resolve_marketing_request
  after insert on public.property_media
  for each row execute function public.property_media_resolve_marketing_request();

alter table public.marketing_requests enable row level security;
create policy marketing_requests_select on public.marketing_requests for select to authenticated
  using (public.has_permission('marketing', 'view') or public.has_permission('properties', 'view'));
create policy marketing_requests_update on public.marketing_requests for update to authenticated
  using (public.has_permission('marketing', 'view') or public.has_permission('marketing', 'assign') or public.has_permission('marketing', 'complete'))
  with check (public.has_permission('marketing', 'view') or public.has_permission('marketing', 'assign') or public.has_permission('marketing', 'complete'));
-- No client insert/delete policy: requests are only created/removed by the
-- triggers above (cascades with the property).

-- Backfill: surface a request for every already-published/created property
-- that has no hero image and no image media yet.
insert into public.marketing_requests (property_id, status)
select p.id, 'pending'
from public.properties p
where (p.hero_image_url is null or p.hero_image_url = '')
  and not exists (select 1 from public.property_media pm where pm.property_id = p.id and pm.media_type = 'image')
  and not exists (select 1 from public.marketing_requests mr where mr.property_id = p.id)
on conflict do nothing;
