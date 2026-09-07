-- List Your Property must land as a real, owner-linked submission instead of
-- a disconnected form post. Add the columns the "list-your-property" Edge
-- Function needs to find-or-create an Owner and attribute the submission to
-- them, plus a development link and an explicit source/terms trail.

alter table public.property_submissions
  add column if not exists owner_id uuid references public.owners(id) on delete set null,
  add column if not exists development_id uuid references public.developments(id) on delete set null,
  add column if not exists source text not null default 'website',
  add column if not exists terms_accepted boolean not null default false;

create index if not exists property_submissions_owner_id_idx on public.property_submissions(owner_id);
create index if not exists property_submissions_status_idx on public.property_submissions(status);

comment on column public.property_submissions.owner_id is 'Owner this submission was filed under - found by phone/email or created by the list-your-property Edge Function.';
comment on column public.property_submissions.source is 'Where the submission came from, e.g. website, staff_entry.';

-- Staff need to see a submission from the Owner side too - the select policy
-- already covers has_permission('submissions','view'); nothing to change there,
-- but make sure listing submissions from an owner's profile is a cheap query.
create index if not exists owners_phone_idx on public.owners(phone);
create index if not exists owners_email_idx on public.owners(lower(email));

-- =============================================================================
-- Centralised, admin-only Mapbox public token, readable by the public website
-- through a narrow security-definer RPC (never a raw table grant, so anon can
-- never read any other app_settings row).
-- =============================================================================

create or replace function public.public_map_config()
returns table (mapbox_token text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select (setting_value->>'token')::text
  from public.app_settings
  where setting_key = 'mapbox_config'
  limit 1;
$$;

grant execute on function public.public_map_config() to anon, authenticated;

-- =============================================================================
-- Anonymous listing-submission uploads: a public visitor filling out the
-- website form has no auth.uid(), so they cannot use the existing
-- own-folder policy. Give anon write-only access under a fixed "pending/"
-- prefix (no select, no update, no delete) - staff already read everything
-- under submission-media via has_permission('submissions','view').
-- =============================================================================

drop policy if exists submission_media_insert_anon on storage.objects;
create policy submission_media_insert_anon on storage.objects for insert to anon
  with check (bucket_id = 'submission-media' and (storage.foldername(name))[1] = 'pending');
