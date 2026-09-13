// Promotes an approved, owner-submitted private R2 photo (attached to a
// property_submission) into the public property gallery - copying the
// object from the private bucket to public/properties/{property_id}/images
// and creating the matching uploads + property_media rows. The original
// private upload row is left untouched (audit trail of what the owner
// actually submitted). Called once per photo from the CRM's "Convert to
// Property" action; never runs automatically, and never touches the
// submission's voice note, which stays private forever.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, hasPermission } from "../_shared/auth.ts";
import { getR2Config, bucketForScope, buildObjectKey, copyObject } from "../_shared/r2.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (!hasPermission(caller.teamMember, "submissions", "review") && !hasPermission(caller.teamMember, "properties", "edit")) {
    return json({ error: "Not authorized to promote submission media" }, 403);
  }

  let body: { uploadId?: string; propertyId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.uploadId || !body.propertyId) return json({ error: "uploadId and propertyId are required" }, 400);

  const { data: upload, error } = await service
    .from("uploads")
    .select("id, storage_provider, storage_bucket, storage_path, mime_type, file_size, filename, width, height, property_submission_id, category")
    .eq("id", body.uploadId)
    .maybeSingle();
  if (error) return json({ error: "Failed to load upload" }, 500);
  if (!upload) return json({ error: "Upload not found" }, 404);
  if (upload.storage_provider !== "r2" || !upload.property_submission_id) {
    return json({ error: "Only an R2-backed submission upload can be promoted." }, 400);
  }
  if (upload.category !== "submission_photo") {
    return json({ error: "Only submission photos can be promoted into a property gallery - the voice note stays private." }, 400);
  }

  const { data: property, error: propErr } = await service.from("properties").select("id").eq("id", body.propertyId).maybeSingle();
  if (propErr) return json({ error: "Failed to load property" }, 500);
  if (!property) return json({ error: "Property not found" }, 404);

  const cfg = getR2Config();
  if (!cfg.configured) {
    return json({ error: `Cloudflare R2 is not configured. Missing ${cfg.missing.join(", ")}.`, configured: false }, 501);
  }
  const publicBucket = bucketForScope(cfg, "public");
  if (!publicBucket) {
    return json({ error: "Cloudflare R2 public bucket is not configured. Missing CLOUDFLARE_R2_PUBLIC_BUCKET." }, 501);
  }

  const extension = upload.storage_path.includes(".") ? upload.storage_path.split(".").pop() ?? null : null;
  const destKey = buildObjectKey({ scope: "public", entityType: "properties", entityId: body.propertyId, subpath: "images", extension });

  try {
    await copyObject({ cfg, sourceBucket: upload.storage_bucket, sourceKey: upload.storage_path, destBucket: publicBucket, destKey });
  } catch (e) {
    return json({ error: `Failed to promote photo: ${(e as Error).message}` }, 502);
  }

  const { data: newUpload, error: insErr } = await service
    .from("uploads")
    .insert({
      category: "property_media",
      filename: upload.filename,
      storage_bucket: publicBucket,
      storage_path: destKey,
      storage_provider: "r2",
      bucket_scope: "public",
      mime_type: upload.mime_type,
      file_size: upload.file_size,
      width: upload.width,
      height: upload.height,
      property_id: body.propertyId,
      processing_status: "completed",
      uploaded_by: caller.userId,
      metadata: { promoted_from_upload_id: upload.id, promoted_from_submission_id: upload.property_submission_id },
    })
    .select("id")
    .single();
  if (insErr || !newUpload) return json({ error: "Photo copied to R2, but failed to save its metadata." }, 500);

  const { count } = await service
    .from("property_media")
    .select("id", { count: "exact", head: true })
    .eq("property_id", body.propertyId);

  const { data: media, error: mediaErr } = await service
    .from("property_media")
    .insert({ property_id: body.propertyId, upload_id: newUpload.id, media_type: "image", display_order: count ?? 0, is_hero: false })
    .select("id")
    .single();
  if (mediaErr || !media) return json({ error: "Photo saved, but failed to add it to the property gallery." }, 500);

  return json({ ok: true, uploadId: newUpload.id, propertyMediaId: media.id, objectKey: destKey, bucket: publicBucket });
});
