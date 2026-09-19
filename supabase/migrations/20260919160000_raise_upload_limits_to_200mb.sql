-- Raise the per-object limit of every legacy/backup Supabase Storage bucket
-- to 200 MiB. Cloudflare R2 remains the primary object store for media;
-- this only prevents the retained Supabase document/legacy paths from
-- imposing smaller per-bucket caps.
--
-- Note: this does not override any project/plan-wide Supabase upload limit.
-- New R2 uploads bypass Supabase Storage entirely.

update storage.buckets
set file_size_limit = 209715200
where id in (
  'lead-imports',
  'conversation-files',
  'property-documents',
  'property-media',
  'call-recordings',
  'general-documents',
  'development-media',
  'development-documents',
  'owner-documents',
  'tenant-documents',
  'blog-images',
  'offer-attachments',
  'submission-media'
);
