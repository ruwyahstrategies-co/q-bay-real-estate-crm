// Returns the bytes of one R2-backed image, for building the property PDF in the browser.
//
// Why this exists: the browser can only read an image's pixels (needed to place it in a PDF) when the storage host
// allows it through CORS, and the public R2 host is set up for the CRM website origin only. A PDF built from a
// preview deployment, a local copy or a native app would silently lose its photos. This function fetches the file
// server-side instead, after the same checks as r2-signed-read:
//   1. the caller is an active staff member with uploads.view, and
//   2. the caller can see the uploads row under row level security (so a photo on a record they cannot open is
//      not served, whatever their role).
// Images only, with a size cap, so it cannot be used to move arbitrary files.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, hasPermission, callerScopedClient } from "../_shared/auth.ts";
import { getR2Config, createSignedReadUrl } from "../_shared/r2.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Image-Type",
};
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const caller = await resolveActiveCaller(req, service);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  if (!hasPermission(caller.teamMember, "uploads", "view")) {
    return json({ error: "Not authorized to view files" }, 403);
  }

  let body: { uploadId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.uploadId) return json({ error: "uploadId is required" }, 400);

  const { data: visible, error: visibleErr } = await callerScopedClient(req)
    .from("uploads")
    .select("id")
    .eq("id", body.uploadId)
    .maybeSingle();
  if (visibleErr) return json({ error: "Failed to load upload" }, 500);
  if (!visible) return json({ error: "Upload not found" }, 404);

  const { data: upload, error } = await service
    .from("uploads")
    .select("id, filename, mime_type, storage_provider, storage_bucket, storage_path, file_size")
    .eq("id", body.uploadId)
    .maybeSingle();
  if (error) return json({ error: "Failed to load upload" }, 500);
  if (!upload) return json({ error: "Upload not found" }, 404);
  if (upload.storage_provider !== "r2") return json({ error: "This upload is not stored in R2." }, 400);

  const ext = String(upload.storage_path ?? upload.filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const type = IMAGE_TYPES.has(String(upload.mime_type)) ? String(upload.mime_type) : TYPE_BY_EXT[ext];
  if (!type) return json({ error: "Only images can be fetched here." }, 415);
  if (upload.file_size && Number(upload.file_size) > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  const cfg = getR2Config();
  if (!cfg.configured) {
    return json({ error: `Cloudflare R2 is not configured. Missing ${cfg.missing.join(", ")}.`, configured: false }, 501);
  }

  const url = await createSignedReadUrl({
    cfg,
    bucket: upload.storage_bucket,
    objectKey: upload.storage_path,
    expiresInSeconds: 120,
  });
  const res = await fetch(url);
  if (!res.ok) return json({ error: `Storage returned HTTP ${res.status}` }, 502);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: "The stored image is empty." }, 502);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "Image is too large." }, 413);

  return new Response(bytes, {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/octet-stream", "X-Image-Type": type, "Cache-Control": "private, max-age=300" },
  });
});
