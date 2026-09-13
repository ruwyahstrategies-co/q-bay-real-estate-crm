# Cloudflare R2 setup

The R2 object-storage architecture is fully implemented in code (Edge
Functions, database columns, CRM and website upload flows). It is currently
running with an honest "not configured yet" state because two pieces of
Cloudflare dashboard configuration still need to be done manually - nothing
here can or should be automated by an AI agent.

The three credential secrets are already configured on the Supabase project:

```
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_KEY_ID
CLOUDFLARE_SECRET_ACCESS_KEY
```

These are R2 / S3-compatible credentials, not a Cloudflare Stream API token.

## STEP 1 - Create two R2 buckets

Cloudflare Dashboard -> R2 Object Storage -> Create bucket

Create:

```
qbay-public-media
qbay-private-media
```

## STEP 2 - Add Supabase secrets

Add these as Supabase Edge Function secrets (same place the three
credentials above already live):

```
CLOUDFLARE_R2_PUBLIC_BUCKET=qbay-public-media
CLOUDFLARE_R2_PRIVATE_BUCKET=qbay-private-media
```

## STEP 3 - Public media delivery

Attach a custom domain to `qbay-public-media`.

Recommended:

```
media.qbayrealestate.com
```

Then add:

```
CLOUDFLARE_R2_PUBLIC_URL=https://media.qbayrealestate.com
```

Once this is set, newly-uploaded public property/development/area/journal
images resolve a real `public_url` automatically - no code change needed.

## STEP 4 - CORS

Configure the `qbay-public-media` bucket's CORS policy to allow:

- The Q-Bay production website domain
- The CRM production domain
- Local development origins if needed

Allowed methods: `GET`, `HEAD`, and `PUT` (PUT is required because the CRM
and website upload directly to R2 via short-lived presigned URLs).

Do not allow a wildcard write origin in production.

## STEP 5 - Keep the private bucket private

Do not enable public access on `qbay-private-media`. Private reads (voice
notes, owner documents, contracts, submission photos before approval) only
ever happen through the `r2-signed-read` Edge Function, which returns a
short-lived signed URL to an authenticated, permitted staff member.

## STEP 6 - Validate credentials

Confirm the existing R2 Access Key ID / Secret Access Key have Object Read &
Write permission on both buckets. No credential values belong in this file
or anywhere in the repo - only Supabase Edge Function secrets.

## What happens before this is done

Every upload path degrades honestly rather than pretending to work:

- `r2-upload` returns HTTP 501 with `"Cloudflare R2 <public|private> bucket
  is not configured. Missing CLOUDFLARE_R2_<SCOPE>_BUCKET."`
- The CRM's upload flow (`useUploadFile`) catches that specific case and
  falls back to the existing Supabase Storage path automatically - staff
  uploads keep working exactly as before, with no visible disruption.
- The website's List Your Property voice note and owner-photo uploads show
  a clear message and let the visitor continue with a text description
  instead - the submission is never blocked.

## Optional: Cloudflare Image Transformations

Not required to complete this work. If later enabled on the
`qbay-public-media` custom domain, thumbnails/listing-card/gallery sizes can
be requested via the `/cdn-cgi/image/...` URL pattern in front of any public
object key, without storing multiple physical copies of the same image.

## Migrating existing Supabase Storage media (later, manual, optional)

`scripts/migrate-media-to-r2.ts` is ready but has never been run. Once the
buckets above exist:

```
bun run migrate:r2                    # dry run - lists what would move
bun run migrate:r2 -- --apply         # actually copy a batch to R2
bun run migrate:r2 -- --apply --limit 500 --category property_media
```

It only ever copies (never deletes the original Supabase Storage object) and
is safe to stop and re-run at any time - already-migrated rows are simply
skipped.
