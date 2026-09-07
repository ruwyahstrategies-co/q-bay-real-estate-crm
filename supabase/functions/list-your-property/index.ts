// Public "List Your Property" intake — the ONLY way an anonymous website
// visitor's Sale Listing Form reaches the CRM. Mirrors website-enquiry:
// anonymous callers have no RLS access to owners/property_submissions (no
// policy permits it), so this function validates, normalises, finds-or-
// creates the Owner, and writes the submission, all via the service role.
// Nothing here ever publishes a property — staff review and convert.

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
const FILE_SHAPE = (
  f: unknown,
): f is { path: string; filename: string; mime_type?: string; size?: number } =>
  !!f &&
  typeof f === "object" &&
  typeof (f as any).path === "string" &&
  typeof (f as any).filename === "string";

type Body = {
  full_name?: string;
  phone?: string;
  email?: string;
  owner_id_number?: string;
  property_type?: string;
  purpose?: string;
  area_id?: string;
  country_id?: string;
  development_id?: string;
  location?: string;
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

  if (!fullName) return json({ error: "Owner name is required" }, 400);
  if (!phone) return json({ error: "Mobile number is required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "Invalid email" }, 400);
  if (!body.property_type) return json({ error: "Property type is required" }, 400);
  if (!body.terms_accepted) return json({ error: "Terms must be accepted" }, 400);

  const furnishing =
    body.furnishing_status && FURNISHING.has(body.furnishing_status)
      ? body.furnishing_status
      : null;
  const media = Array.isArray(body.media) ? body.media.filter(FILE_SHAPE) : [];
  const documents = Array.isArray(body.documents) ? body.documents.filter(FILE_SHAPE) : [];

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
      property_type: body.property_type,
      purpose: body.purpose || "sale",
      area_id: body.area_id || null,
      country_id: body.country_id || null,
      development_id: body.development_id || null,
      location: body.location?.trim() || null,
      tower_name: body.tower_name?.trim() || null,
      floor_number: body.floor_number?.trim() || null,
      unit_number: body.unit_number?.trim() || null,
      bedrooms: body.bedrooms ?? null,
      bathrooms: body.bathrooms ?? null,
      size: body.size ?? null,
      parking_spaces: body.parking_spaces ?? null,
      furnishing_status: furnishing,
      price: body.price ?? null,
      description: body.description?.trim() || null,
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

  return json({ ok: true, submission_id: submission.id, owner_id: ownerId });
});
