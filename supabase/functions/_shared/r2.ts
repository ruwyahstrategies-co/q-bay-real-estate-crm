// Cloudflare R2 object-storage abstraction shared by every R2-capable edge
// function (r2-upload, r2-signed-read, r2-delete, r2-promote) plus
// list-your-property. This is the ONLY place that signs R2 requests, builds
// object keys, or resolves public URLs - nothing else in the codebase talks
// to R2 directly. See docs/CLOUDFLARE_R2_SETUP.md for the manual Cloudflare
// dashboard setup this depends on.
//
// Required Edge Function secrets (already configured in this project):
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_ACCESS_KEY_ID
//   CLOUDFLARE_SECRET_ACCESS_KEY
// These are R2 / S3-compatible credentials, NOT the Cloudflare Stream API
// token (CLOUDFLARE_STREAM_API_TOKEN, used only by cloudflare-stream-upload
// for video - a separate Cloudflare product with its own secret).
//
// Not yet configured - every function here degrades honestly (a clear 501,
// never a fake success) until these exist:
//   CLOUDFLARE_R2_PUBLIC_BUCKET   e.g. qbay-public-media
//   CLOUDFLARE_R2_PRIVATE_BUCKET  e.g. qbay-private-media
//   CLOUDFLARE_R2_PUBLIC_URL      e.g. https://media.qbayrealestate.com (optional)

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

export type R2Scope = "public" | "private";

export type R2Config =
  | {
      configured: true;
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBucket: string | null;
      privateBucket: string | null;
      publicUrl: string | null;
      endpoint: string;
    }
  | { configured: false; missing: string[] };

export function getR2Config(): R2Config {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("CLOUDFLARE_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("CLOUDFLARE_SECRET_ACCESS_KEY");
  const missing: string[] = [];
  if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!accessKeyId) missing.push("CLOUDFLARE_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("CLOUDFLARE_SECRET_ACCESS_KEY");
  if (missing.length > 0) return { configured: false, missing };

  return {
    configured: true,
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    publicBucket: Deno.env.get("CLOUDFLARE_R2_PUBLIC_BUCKET") ?? null,
    privateBucket: Deno.env.get("CLOUDFLARE_R2_PRIVATE_BUCKET") ?? null,
    publicUrl: Deno.env.get("CLOUDFLARE_R2_PUBLIC_URL") ?? null,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

type ReadyConfig = Extract<R2Config, { configured: true }>;

export function bucketForScope(cfg: ReadyConfig, scope: R2Scope): string | null {
  return scope === "public" ? cfg.publicBucket : cfg.privateBucket;
}

function getClient(cfg: ReadyConfig): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

/**
 * Deterministic, collision-free object key. Identity always comes from a
 * server-generated UUID, never from the uploader's filename.
 * Shape: {scope}/{entityType}/{entityId}/{subpath}/{uuid}.{ext}
 */
export function buildObjectKey(opts: {
  scope: R2Scope;
  entityType: string;
  entityId: string;
  subpath?: string;
  extension?: string | null;
}): string {
  const parts = [opts.scope, opts.entityType, opts.entityId];
  if (opts.subpath) parts.push(opts.subpath);
  const id = crypto.randomUUID();
  const ext = opts.extension ? `.${opts.extension.replace(/^\./, "").toLowerCase()}` : "";
  parts.push(`${id}${ext}`);
  return parts.join("/");
}

async function presign(
  cfg: ReadyConfig,
  bucket: string,
  objectKey: string,
  method: "PUT" | "GET",
  expiresInSeconds: number,
  contentType?: string,
): Promise<string> {
  const client = getClient(cfg);
  const url = new URL(`${cfg.endpoint}/${bucket}/${objectKey}`);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client.sign(url.toString(), {
    method,
    headers: contentType ? { "content-type": contentType } : undefined,
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function createUploadAuthorization(opts: {
  cfg: ReadyConfig;
  bucket: string;
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; expiresAt: string }> {
  const expiresIn = opts.expiresInSeconds ?? 300;
  const uploadUrl = await presign(opts.cfg, opts.bucket, opts.objectKey, "PUT", expiresIn, opts.contentType);
  return { uploadUrl, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

export async function createSignedReadUrl(opts: {
  cfg: ReadyConfig;
  bucket: string;
  objectKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  return presign(opts.cfg, opts.bucket, opts.objectKey, "GET", opts.expiresInSeconds ?? 3600);
}

export async function deleteObject(opts: { cfg: ReadyConfig; bucket: string; objectKey: string }): Promise<void> {
  const client = getClient(opts.cfg);
  const url = `${opts.cfg.endpoint}/${opts.bucket}/${opts.objectKey}`;
  const res = await client.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (HTTP ${res.status})`);
  }
}

/** Server-side copy - used to promote an approved private submission photo into the public property gallery. */
export async function copyObject(opts: {
  cfg: ReadyConfig;
  sourceBucket: string;
  sourceKey: string;
  destBucket: string;
  destKey: string;
}): Promise<void> {
  const client = getClient(opts.cfg);
  const url = `${opts.cfg.endpoint}/${opts.destBucket}/${opts.destKey}`;
  const res = await client.fetch(url, {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${opts.sourceBucket}/${opts.sourceKey}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 copy failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
}

export function resolvePublicUrl(cfg: ReadyConfig, bucket: string, objectKey: string): string | null {
  if (!cfg.publicUrl || !cfg.publicBucket || bucket !== cfg.publicBucket) return null;
  return `${cfg.publicUrl.replace(/\/$/, "")}/${objectKey}`;
}
