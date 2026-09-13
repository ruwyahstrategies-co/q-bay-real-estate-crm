// Deletes an R2-backed uploads row: removes the R2 object first, then the
// database row (which cascades to property_media via its FK). Gated by
// has_permission('uploads','delete'), matching the existing uploads_delete
// RLS policy exactly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, hasPermission } from "../_shared/auth.ts";
import { getR2Config, deleteObject } from "../_shared/r2.ts";

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
  if (!hasPermission(caller.teamMember, "uploads", "delete")) {
    return json({ error: "Not authorized to delete files" }, 403);
  }

  let body: { uploadId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.uploadId) return json({ error: "uploadId is required" }, 400);

  const { data: upload, error } = await service
    .from("uploads")
    .select("id, storage_provider, storage_bucket, storage_path")
    .eq("id", body.uploadId)
    .maybeSingle();
  if (error) return json({ error: "Failed to load upload" }, 500);
  if (!upload) return json({ error: "Upload not found" }, 404);
  if (upload.storage_provider !== "r2") {
    return json({ error: "This upload is not stored in R2 - delete it via Supabase Storage instead." }, 400);
  }

  const cfg = getR2Config();
  if (!cfg.configured) {
    return json({ error: `Cloudflare R2 is not configured. Missing ${cfg.missing.join(", ")}.`, configured: false }, 501);
  }

  try {
    await deleteObject({ cfg, bucket: upload.storage_bucket, objectKey: upload.storage_path });
  } catch (e) {
    return json({ error: `Failed to delete R2 object: ${(e as Error).message}` }, 502);
  }

  const { error: delErr } = await service.from("uploads").delete().eq("id", upload.id);
  if (delErr) return json({ error: "R2 object deleted, but failed to remove the database record." }, 500);

  return json({ ok: true });
});
