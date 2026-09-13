// Client-side Cloudflare R2 helpers for the CRM. Nothing here ever sees an
// R2 credential - every call goes through the r2-* Edge Functions, which
// hold the secrets server-side. This is the one place the CRM talks to R2;
// callers (useUploadFile, submission drawer, property gallery) go through
// these functions rather than reimplementing the flow.

import { supabase } from "@/integrations/supabase/client";
import type { UploadCategoryKey } from "@/lib/db";

export class R2NotConfiguredError extends Error {}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string; configured?: boolean }>(fn, { body });
  if (error || (data as { error?: string } | null)?.error) {
    let message = (data as { error?: string } | null)?.error ?? error?.message ?? `${fn} failed`;
    let configured: boolean | undefined = (data as { configured?: boolean } | null)?.configured;
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.error) message = body.error;
        if (typeof body?.configured === "boolean") configured = body.configured;
      } catch {
        // ignore - fall back to the message already set above
      }
    }
    if (configured === false) throw new R2NotConfiguredError(message);
    throw new Error(message);
  }
  return data as T;
}

export type R2UploadAuthorization = {
  ok: true;
  provider: "r2";
  bucket: string;
  scope: "public" | "private";
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
};

/** Requests a presigned R2 PUT URL for a staff (CRM) upload into an UPLOAD_CATEGORIES bucket. */
export async function authorizeCrmUpload(opts: {
  categoryKey: UploadCategoryKey;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<R2UploadAuthorization> {
  return invoke<R2UploadAuthorization>("r2-upload", {
    context: "crm",
    category: opts.categoryKey,
    entityId: opts.entityId,
    filename: opts.filename,
    mimeType: opts.mimeType,
    sizeBytes: opts.sizeBytes,
  });
}

/** PUTs the file bytes straight to R2 using a presigned URL, with optional progress. */
export function putToR2(uploadUrl: string, file: File | Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload to Cloudflare R2 failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to Cloudflare R2"));
    xhr.send(file);
  });
}

/** Gets a short-lived signed GET URL for a private (or public) R2-backed uploads row. */
export async function getR2SignedReadUrl(uploadId: string): Promise<string> {
  const res = await invoke<{ ok: true; signedUrl: string }>("r2-signed-read", { uploadId });
  return res.signedUrl;
}

/** Deletes an R2-backed uploads row (object + database record). */
export async function deleteR2Upload(uploadId: string): Promise<void> {
  await invoke<{ ok: true }>("r2-delete", { uploadId });
}

/** Promotes an approved submission photo (private R2) into the public property gallery. */
export async function promoteSubmissionPhoto(opts: {
  uploadId: string;
  propertyId: string;
}): Promise<{ ok: true; uploadId: string; propertyMediaId: string }> {
  return invoke("r2-promote", { uploadId: opts.uploadId, propertyId: opts.propertyId });
}

/**
 * Resolves a public delivery URL for a public-scope R2 object, purely
 * client-side, from the non-secret VITE_R2_PUBLIC_MEDIA_URL hostname (if
 * set). Never used for private objects - those only ever get a URL via
 * getR2SignedReadUrl. Returns null (never a fake URL) until the hostname is
 * configured - see docs/CLOUDFLARE_R2_SETUP.md.
 */
export function resolveR2PublicUrl(objectKey: string): string | null {
  const base = import.meta.env.VITE_R2_PUBLIC_MEDIA_URL as string | undefined;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${objectKey}`;
}
