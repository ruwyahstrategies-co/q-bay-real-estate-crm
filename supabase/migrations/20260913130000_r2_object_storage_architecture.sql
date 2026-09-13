-- Cloudflare R2 object-storage architecture: additive columns only, no
-- destructive changes. Existing Supabase Storage rows remain valid via
-- storage_provider = 'supabase' (the default). New R2-backed rows set
-- storage_provider = 'r2', reusing storage_bucket/storage_path to hold the
-- R2 bucket name and object key respectively - no separate object_key
-- column, avoiding a parallel/duplicate storage model. See
-- docs/CLOUDFLARE_R2_SETUP.md for the manual Cloudflare-side setup.

alter table public.uploads
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists bucket_scope text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists duration_seconds numeric,
  add column if not exists property_submission_id uuid references public.property_submissions(id) on delete cascade;

alter table public.uploads
  drop constraint if exists uploads_storage_provider_check;
alter table public.uploads
  add constraint uploads_storage_provider_check
    check (storage_provider = any (array['supabase','r2']::text[]));

alter table public.uploads
  drop constraint if exists uploads_bucket_scope_check;
alter table public.uploads
  add constraint uploads_bucket_scope_check
    check (bucket_scope is null or bucket_scope = any (array['public','private']::text[]));

-- Non-destructive backfill: classify existing Supabase Storage rows by
-- their known bucket so bucket_scope is meaningful immediately. No file is
-- moved or touched, this only labels existing metadata rows.
update public.uploads set bucket_scope = 'public'
  where bucket_scope is null and storage_bucket in ('property-media','development-media','blog-images');
update public.uploads set bucket_scope = 'private'
  where bucket_scope is null and storage_bucket in (
    'property-documents','development-documents','submission-media',
    'owner-documents','lead-imports','conversation-files','call-recordings','general-documents'
  );

create index if not exists uploads_property_submission_id_idx on public.uploads(property_submission_id);
create index if not exists uploads_storage_provider_idx on public.uploads(storage_provider);

alter table public.property_media
  add column if not exists is_hero boolean not null default false;

create index if not exists property_media_property_id_is_hero_idx on public.property_media(property_id, is_hero);

comment on column public.uploads.storage_provider is 'supabase (legacy Supabase Storage) or r2 (Cloudflare R2). For r2 rows, storage_bucket holds the R2 bucket name and storage_path holds the R2 object key.';
comment on column public.uploads.bucket_scope is 'public = marketing media servable via a public/CDN url; private = controlled/signed access only. Null only for legacy rows predating this classification.';
comment on column public.uploads.property_submission_id is 'Links an upload (voice note, owner-submitted photo) to a public List Your Property submission, independent of the legacy media/documents jsonb columns on property_submissions.';
comment on column public.property_media.is_hero is 'Marks the single gallery image used as the property hero image; properties.hero_image_url is kept in sync for backward compatibility with existing hero rendering.';
