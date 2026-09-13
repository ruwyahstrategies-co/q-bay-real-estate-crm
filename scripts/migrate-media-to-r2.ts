#!/usr/bin/env bun
// Legacy Supabase Storage -> Cloudflare R2 media migration.
//
// NOT run automatically by anything. This is prepared infrastructure for a
// deliberate, future, manual migration once the Cloudflare buckets exist
// (see docs/CLOUDFLARE_R2_SETUP.md) - it does nothing destructive and is
// never invoked as part of any build, deploy, or CI step.
//
// Design:
//   - Idempotent & resumable for free: it only ever selects uploads rows
//     where storage_provider = 'supabase'. A row that migrates successfully
//     flips to storage_provider = 'r2' and is never selected again, so
//     re-running the script (after a crash, a rate limit, or just to pick
//     up new uploads) naturally continues where it left off.
//   - Copy-only, never delete: the original Supabase Storage object is left
//     completely untouched. Rollback is trivial - the bytes are still
//     there, so a failed or regretted migration just needs the database row
//     flipped back (this script also writes metadata.migrated_from with the
//     original bucket/path so that's a one-line update, not a guess).
//   - Dry-run by default. Nothing is written to R2 or Postgres unless you
//     pass --apply.
//
// Usage (from the CRM repo root):
//   bun run scripts/migrate-media-to-r2.ts                 # dry run, first 50 rows
//   bun run scripts/migrate-media-to-r2.ts --apply          # actually migrate, first 50 rows
//   bun run scripts/migrate-media-to-r2.ts --apply --limit 500
//   bun run scripts/migrate-media-to-r2.ts --apply --category property_media
//
// Required environment variables (same names as the Edge Function secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY
//   CLOUDFLARE_R2_PUBLIC_BUCKET, CLOUDFLARE_R2_PRIVATE_BUCKET
//   CLOUDFLARE_R2_PUBLIC_URL (optional - only needed to populate public_url)

import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

type UploadRow = {
  id: string;
  category: string;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  bucket_scope: "public" | "private" | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(arg("limit") ?? 50);
const CATEGORY = arg("category");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const ACCESS_KEY_ID = requireEnv("CLOUDFLARE_ACCESS_KEY_ID");
  const SECRET_ACCESS_KEY = requireEnv("CLOUDFLARE_SECRET_ACCESS_KEY");
  const PUBLIC_BUCKET = process.env.CLOUDFLARE_R2_PUBLIC_BUCKET;
  const PRIVATE_BUCKET = process.env.CLOUDFLARE_R2_PRIVATE_BUCKET;
  const PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  if (!PUBLIC_BUCKET || !PRIVATE_BUCKET) {
    console.error(
      "CLOUDFLARE_R2_PUBLIC_BUCKET and CLOUDFLARE_R2_PRIVATE_BUCKET must both be set - see docs/CLOUDFLARE_R2_SETUP.md.",
    );
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const r2 = new AwsClient({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

  let q = sb
    .from("uploads")
    .select("id, category, filename, storage_bucket, storage_path, bucket_scope, mime_type, metadata")
    .eq("storage_provider", "supabase")
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  if (CATEGORY) q = q.eq("category", CATEGORY);

  const { data: rows, error } = await q;
  if (error) {
    console.error("Failed to list candidate rows:", error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("Nothing to migrate - no uploads rows with storage_provider = 'supabase' matched.");
    return;
  }

  console.log(`${APPLY ? "Migrating" : "[dry run] Would migrate"} ${rows.length} row(s)${CATEGORY ? ` in category "${CATEGORY}"` : ""}.`);

  let migrated = 0;
  let failed = 0;
  for (const row of rows as UploadRow[]) {
    const scope: "public" | "private" = row.bucket_scope === "public" ? "public" : "private";
    const destBucket = scope === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const destKey = `${scope}/legacy/${row.category}/${row.id}/${row.filename}`;

    if (!APPLY) {
      console.log(`  [dry run] ${row.storage_bucket}/${row.storage_path} -> r2:${destBucket}/${destKey}`);
      continue;
    }

    try {
      const { data: fileData, error: dlErr } = await sb.storage.from(row.storage_bucket).download(row.storage_path);
      if (dlErr || !fileData) throw new Error(dlErr?.message ?? "download returned no data");
      const bytes = await fileData.arrayBuffer();

      const putUrl = `${endpoint}/${destBucket}/${destKey}`;
      const putRes = await r2.fetch(putUrl, {
        method: "PUT",
        headers: { "content-type": row.mime_type ?? "application/octet-stream" },
        body: bytes,
      });
      if (!putRes.ok) throw new Error(`R2 PUT failed (HTTP ${putRes.status})`);

      const headRes = await r2.fetch(putUrl, { method: "HEAD" });
      const uploadedSize = Number(headRes.headers.get("content-length") ?? -1);
      if (uploadedSize !== bytes.byteLength) {
        throw new Error(`Size mismatch after upload (expected ${bytes.byteLength}, got ${uploadedSize})`);
      }

      const publicUrl = scope === "public" && PUBLIC_URL ? `${PUBLIC_URL.replace(/\/$/, "")}/${destKey}` : null;

      const { error: updErr } = await sb
        .from("uploads")
        .update({
          storage_provider: "r2",
          storage_bucket: destBucket,
          storage_path: destKey,
          public_url: publicUrl,
          metadata: {
            ...(row.metadata ?? {}),
            migrated_from: { provider: "supabase", bucket: row.storage_bucket, path: row.storage_path },
            migrated_at: new Date().toISOString(),
          },
        })
        .eq("id", row.id);
      if (updErr) throw updErr;

      migrated += 1;
      console.log(`  OK  ${row.id}  ${row.storage_bucket}/${row.storage_path} -> r2:${destBucket}/${destKey}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${row.id}  ${(e as Error).message}`);
    }
  }

  if (APPLY) {
    console.log(`\nDone. Migrated ${migrated}, failed ${failed}. Re-run to continue with the next batch.`);
  } else {
    console.log("\nDry run only - re-run with --apply to actually migrate. Nothing was written.");
  }
}

main();
