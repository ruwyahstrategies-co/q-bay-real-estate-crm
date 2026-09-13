// Public "List Your Property" intake — the ONLY way an anonymous website
// visitor's submission reaches the CRM. Mirrors website-enquiry: anonymous
// callers have no RLS access to owners/property_submissions (no policy
// permits it), so this function validates, normalises, finds-or-creates the
// Owner, and writes the submission, all via the service role. Nothing here
// ever publishes a property — staff review and convert.
//
// The simplified form only requires full_name, phone, a description (typed
// text and/or a recorded voice note) and terms_accepted — every other field
// stays exactly as optional as it already was. A voice note and/or owner
// photos arrive as R2 object references (already uploaded client-side via
// r2-upload) and are recorded as `uploads` rows linked through the new
// property_submission_id column — the legacy `media`/`documents` jsonb
// arrays (Supabase Storage paths) keep working unchanged for anything still
// using that path.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function checkRateLimit(
  req: Request,
  service: SupabaseClient,
  fnName: string,
  maxPerMinute: number,
): Promise<boolean> {
  try {
    const xf = req.headers.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0].trim() : req.headers.get("cf-connecting-ip") || "anon";
    const [{ data: ipOk }, { data: globalOk }] = await Promise.all([
      service.rpc("check_rate_limit", {
        _key: `${fnName}:ip:${ip}`,
        _max_per_minute: maxPerMinute,
      }),
      service.rpc("check_rate_limit", {
        _key: `${fnName}:global`,
        _max_per_minute: maxPerMinute * 10,
      }),
    ]);
    return ipOk !== false && globalOk !== false;
  } catch {
    return true;
  }
}
function tooManyRequests(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-12) : null;
}

const FURNISHING = new Set(["FF", "SF", "UF"]);
const SUBMISSION_PURPOSES = new Set(["sell", "rent", "let"]);
const FILE_SHAPE = (
  f: unknown,
): f is { path: string; filename: string; mime_type?: string; size?: number } =>
  !!f &&
  typeof f === "object" &&
  typeof (f as any).path === "string" &&
  typeof (f as any).filename === "string";

type R2Ref = { object_key: string; bucket: string; mime_type?: string; size?: number };
const R2_REF_SHAPE = (f: unknown): f is R2Ref =>
  !!f && typeof f === "object" && typeof (f as any).object_key === "string" && typeof (f as any).bucket === "string";

type Body = {
  full_name?: string;
  phone?: string;
  email?: string;
  owner_id_number?: string;
  property_type?: string;
  purpose?: string;
  area_id?: string;
  custom_area?: string;
  country_id?: string;
  development_id?: string;
  location?: string;
  available_from?: string;
  tower_name?: string;
  floor_number?: string;
  unit_number?: string;
  bedrooms?: number;
  bathrooms?: number;
  size?: number;
  parking_spaces?: number;
  furnishing_status?: string;
  price?: number;
  description?: string;
  terms_accepted?: boolean;
  media?: unknown[];
  documents?: unknown[];
  website_profile_id?: string;
  // New: R2-backed voice note and/or owner photos, uploaded client-side
  // beforehand via r2-upload (context: "public_submission").
  voice_note?: { object_key?: string; bucket?: string; mime_type?: string; duration_seconds?: number; size?: number };
  r2_photos?: unknown[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!(await checkRateLimit(req, service, "list-your-property", 5))) return tooManyRequests(CORS);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const fullName = body.full_name?.trim();
  const phone = normalisePhone(body.phone);
  const email = body.email?.trim()?.toLowerCase() || null;
  const description = body.description?.trim() || null;
  const voiceNote = R2_REF_SHAPE(body.voice_note) ? body.voice_note : null;

  if (!fullName) return json({ error: "Owner name is required" }, 400);
  if (!phone) return json({ error: "Mobile number is required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "Invalid email" }, 400);
  if (!body.terms_accepted) return json({ error: "Terms must be accepted" }, 400);
  if (!description && !voiceNote) {
    return json({ error: "Please add a description or record a voice note" }, 400);
  }

  const furnishing =
    body.furnishing_status && FURNISHING.has(body.furnishing_status)
      ? body.furnishing_status
      : null;
  const purpose =
    body.purpose && SUBMISSION_PURPOSES.has(body.purpose) ? body.purpose : "sell";
  // Public users never write into the canonical Areas table - only a real
  // area_id (already selected from Areas) or a free-text custom_area, never
  // both at once.
  const areaId = body.area_id?.trim() || null;
  const customArea = !areaId ? body.custom_area?.trim() || null : null;
  const availableFrom =
    body.available_from && /^\d{4}-\d{2}-\d{2}$/.test(body.available_from)
      ? body.available_from
      : null;
  const media = Array.isArray(body.media) ? body.media.filter(FILE_SHAPE) : [];
  const documents = Array.isArray(body.documents) ? body.documents.filter(FILE_SHAPE) : [];
  const r2Photos = Array.isArray(body.r2_photos) ? body.r2_photos.filter(R2_REF_SHAPE) : [];

  // Find an existing Owner by phone or email; never create a duplicate.
  let ownerId: string | null = null;
  if (phone) {
    const { data: existing } = await service
      .from("owners")
      .select("id")
      .ilike("phone", `%${phone.slice(-8)}%`)
      .limit(1)
      .maybeSingle();
    ownerId = existing?.id ?? null;
  }
  if (!ownerId && email) {
    const { data: existing } = await service
      .from("owners")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    ownerId = existing?.id ?? null;
  }

  if (!ownerId) {
    const { data: created, error } = await service
      .from("owners")
      .insert({
        name: fullName,
        phone,
        email,
        id_number: body.owner_id_number?.trim() || null,
      })
      .select("id")
      .single();
    if (error || !created) return json({ error: "Failed to create owner record" }, 500);
    ownerId = created.id;
  } else {
    // Backfill an ID number a returning owner didn't have on file yet - never overwrite one that's already set.
    if (body.owner_id_number?.trim()) {
      await service
        .from("owners")
        .update({ id_number: body.owner_id_number.trim() })
        .eq("id", ownerId)
        .is("id_number", null);
    }
  }

  const { data: submission, error: subErr } = await service
    .from("property_submissions")
    .insert({
      owner_id: ownerId,
      website_profile_id: body.website_profile_id ?? null,
      full_name: fullName,
      phone,
      email,
      owner_id_number: body.owner_id_number?.trim() || null,
      property_type: body.property_type?.trim() || null,
      purpose,
      area_id: areaId,
      custom_area: customArea,
      country_id: body.country_id || null,
      development_id: body.development_id || null,
      location: body.location?.trim() || null,
      available_from: availableFrom,
      tower_name: body.tower_name?.trim() || null,
      floor_number: body.floor_number?.trim() || null,
      unit_number: body.unit_number?.trim() || null,
      bedrooms: body.bedrooms ?? null,
      bathrooms: body.bathrooms ?? null,
      size: body.size ?? null,
      parking_spaces: body.parking_spaces ?? null,
      furnishing_status: furnishing,
      price: body.price ?? null,
      description,
      media,
      documents,
      status: "new",
      source: "website",
      terms_accepted: true,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (subErr || !submission) return json({ error: "Failed to save submission" }, 500);

  // Record any R2-backed voice note / owner photos, linked via the new
  // property_submission_id column. Best-effort: a failure here must not
  // lose the submission itself, since the core record is already saved.
  const r2Rows: Record<string, unknown>[] = [];
  if (voiceNote) {
    r2Rows.push({
      category: "voice_note",
      filename: voiceNote.object_key.split("/").pop() ?? "voice-note",
      storage_bucket: voiceNote.bucket,
      storage_path: voiceNote.object_key,
      storage_provider: "r2",
      bucket_scope: "private",
      mime_type: voiceNote.mime_type ?? null,
      file_size: voiceNote.size ?? null,
      duration_seconds: body.voice_note?.duration_seconds ?? null,
      property_submission_id: submission.id,
      processing_status: "completed",
    });
  }
  for (const photo of r2Photos) {
    r2Rows.push({
      category: "submission_photo",
      filename: photo.object_key.split("/").pop() ?? "photo",
      storage_bucket: photo.bucket,
      storage_path: photo.object_key,
      storage_provider: "r2",
      bucket_scope: "private",
      mime_type: photo.mime_type ?? null,
      file_size: photo.size ?? null,
      property_submission_id: submission.id,
      processing_status: "completed",
    });
  }
  if (r2Rows.length > 0) {
    const { error: uploadsErr } = await service.from("uploads").insert(r2Rows);
    if (uploadsErr) {
      console.error("[list-your-property] failed to save R2 media rows", uploadsErr.message);
    }
  }

  return json({ ok: true, submission_id: submission.id, owner_id: ownerId });
});
