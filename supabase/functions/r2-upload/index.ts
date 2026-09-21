// Issues short-lived, permission-checked presigned R2 upload URLs for two
// contexts:
//   - "crm": authenticated staff uploading into any UPLOAD_CATEGORIES
//     bucket (property media, documents, call recordings, etc.)
//   - "public_submission": anonymous List Your Property submitters
//     recording a voice note or attaching owner photos, rate-limited the
//     same way list-your-property is.
//
// The browser PUTs file bytes straight to R2 using the returned URL -
// Supabase never receives the file, and the R2 credentials never leave
// this function. verify_jwt is OFF at the platform level (the public
// context has no JWT at all) - the crm context authenticates itself below,
// exactly like list-your-property already does for its own anonymous path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, hasPermission } from "../_shared/auth.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { getR2Config, bucketForScope, buildObjectKey, createUploadAuthorization } from "../_shared/r2.ts";
import { R2_CATEGORY_MAP } from "../_shared/upload-categories.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBMISSION_KINDS: Record<string, { entityType: string; scope: "private"; subpath: string; maxMb: number; mimePrefixes: string[] }> = {
  voice_note: { entityType: "submissions", scope: "private", subpath: "voice", maxMb: 200, mimePrefixes: ["audio/"] },
  submission_photo: { entityType: "submissions", scope: "private", subpath: "images", maxMb: 200, mimePrefixes: ["image/"] },
};

type Body = {
  context?: "crm" | "public_submission";
  category?: string;
  entityId?: string;
  kind?: "voice_note" | "submission_photo";
  submissionToken?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const cfg = getR2Config();
  if (!cfg.configured) {
    return json(
      { error: `Cloudflare R2 is not configured yet. Missing ${cfg.missing.join(", ")} as Edge Function secrets.`, configured: false },
      501,
    );
  }

  const filename = body.filename?.trim();
  const mimeType = body.mimeType?.trim();
  const sizeBytes = body.sizeBytes;
  if (!filename || !mimeType || !sizeBytes || sizeBytes <= 0) {
    return json({ error: "filename, mimeType and sizeBytes are required" }, 400);
  }
  const extension = filename.includes(".") ? filename.split(".").pop() ?? null : null;

  let entityType: string;
  let scope: "public" | "private";
  let subpath: string;
  let maxMb: number;
  let mimePrefixes: string[];
  let entityId: string;

  if (body.context === "public_submission") {
    if (!(await checkRateLimit(req, "r2-upload", 8))) return tooManyRequests(CORS);
    const kind = body.kind;
    if (!kind || !SUBMISSION_KINDS[kind]) return json({ error: "Invalid kind" }, 400);
    if (!body.submissionToken || !UUID_RE.test(body.submissionToken)) {
      return json({ error: "Invalid submissionToken" }, 400);
    }
    ({ entityType, scope, subpath, maxMb, mimePrefixes } = SUBMISSION_KINDS[kind]);
    entityId = body.submissionToken;
  } else {
    const caller = await resolveActiveCaller(req, service);
    if (!caller.ok) return json({ error: caller.error }, caller.status);
    const category = body.category;
    // Profile pictures are self-service: no uploads.upload needed, but strictly the caller's own folder.
    const isAvatar = category === "staff_avatars";
    if (!isAvatar && !hasPermission(caller.teamMember, "uploads", "upload")) {
      return json({ error: "Not authorized to upload files" }, 403);
    }
    if (!category || !R2_CATEGORY_MAP[category]) return json({ error: "Invalid category" }, 400);
    if (!body.entityId || !UUID_RE.test(body.entityId)) return json({ error: "Invalid entityId" }, 400);
    if (isAvatar && body.entityId.toLowerCase() !== caller.teamMember.id.toLowerCase()) {
      return json({ error: "You can only upload a profile picture for your own account" }, 403);
    }
    ({ entityType, scope, subpath, maxMb, mimePrefixes } = R2_CATEGORY_MAP[category]);
    entityId = body.entityId;
  }

  if (sizeBytes > maxMb * 1024 * 1024) return json({ error: `File exceeds ${maxMb} MB limit.` }, 400);
  if (mimePrefixes.length > 0 && !mimePrefixes.some((p) => mimeType.startsWith(p))) {
    return json({ error: `Unsupported file type "${mimeType}" for this upload.` }, 400);
  }

  const bucket = bucketForScope(cfg, scope);
  if (!bucket) {
    return json(
      {
        error: `Cloudflare R2 ${scope} bucket is not configured. Missing CLOUDFLARE_R2_${scope.toUpperCase()}_BUCKET.`,
        configured: false,
      },
      501,
    );
  }

  const objectKey = buildObjectKey({ scope, entityType, entityId, subpath, extension });
  const { uploadUrl, expiresAt } = await createUploadAuthorization({ cfg, bucket, objectKey, contentType: mimeType });

  return json({ ok: true, provider: "r2", bucket, scope, objectKey, uploadUrl, expiresAt });
});
