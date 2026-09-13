// Publishes/unpublishes a Property to an external listing destination (Mazad
// Qatar or Property Finder). QBay's own visibility stays governed by
// properties.is_published and is never touched here.
//
// Neither provider has credentials or an API specification supplied yet, so
// every attempt is honestly recorded as 'failed' with a clear reason rather
// than pretending to have published anything - exactly the pattern already
// used for SMS in supabase/functions/sms-send. Once Q-Bay supplies API
// credentials AND the field-mapping/endpoint documentation for a provider,
// only that provider's adapter function below needs a real implementation;
// the queue/status plumbing, auth and RLS around it do not change.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
  role: string | null;
  permissions: Record<string, string[]> | null;
};
type ResolvedCaller =
  { ok: true; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

async function resolveActiveCaller(
  req: Request,
  serviceClient: SupabaseClient,
): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer "))
    return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };
  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members")
    .select("id, user_id, is_active, role, permissions")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (memberErr) return { ok: false, status: 500, error: "Failed to resolve staff record" };
  if (!teamMember) return { ok: false, status: 403, error: "Account not provisioned." };
  if (teamMember.is_active === false)
    return { ok: false, status: 403, error: "Account is inactive." };
  return { ok: true, teamMember: teamMember as TeamMemberRow };
}

function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Destination = "mazad" | "property_finder";
type PropertyRow = Record<string, unknown> & { id: string; title: string };

type AdapterResult = { ok: true; externalId: string } | { ok: false; error: string };

/** Maps a Property row to the payload shape a destination's API would expect. */
function mapPropertyForExport(property: PropertyRow) {
  return {
    reference: property.reference_code,
    title: property.title,
    description: property.description,
    purpose: property.purpose,
    property_type: property.property_type,
    price: property.price,
    currency: property.currency,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    size: property.size,
    size_unit: property.size_unit,
    location: property.location,
    latitude: property.latitude,
    longitude: property.longitude,
    amenities: property.amenities,
    hero_image_url: property.hero_image_url,
    available_from: property.available_from,
  };
}

/** Mazad Qatar adapter. No credentials/API documentation supplied yet. */
async function publishToMazad(property: PropertyRow): Promise<AdapterResult> {
  const apiUrl = Deno.env.get("MAZAD_API_URL");
  const apiKey = Deno.env.get("MAZAD_API_KEY");
  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      error:
        "Missing Mazad Qatar API credentials (MAZAD_API_URL / MAZAD_API_KEY). Add them in Supabase Edge Function secrets, then retry.",
    };
  }
  // Credentials exist but Mazad has not supplied API/field-mapping
  // documentation, so the actual request cannot be built honestly yet.
  const _payload = mapPropertyForExport(property);
  return {
    ok: false,
    error:
      "Mazad Qatar credentials are configured, but no API specification has been supplied yet to build the real request. Publishing is blocked until Q-Bay provides Mazad's API documentation.",
  };
}

/** Property Finder adapter. No credentials/API documentation supplied yet. */
async function publishToPropertyFinder(property: PropertyRow): Promise<AdapterResult> {
  const apiUrl = Deno.env.get("PROPERTY_FINDER_API_URL");
  const apiKey = Deno.env.get("PROPERTY_FINDER_API_KEY");
  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      error:
        "Missing Property Finder API credentials (PROPERTY_FINDER_API_URL / PROPERTY_FINDER_API_KEY). Add them in Supabase Edge Function secrets, then retry.",
    };
  }
  const _payload = mapPropertyForExport(property);
  return {
    ok: false,
    error:
      "Property Finder credentials are configured, but no API specification has been supplied yet to build the real request. Publishing is blocked until Q-Bay provides Property Finder's API documentation.",
  };
}

async function unpublishFromDestination(
  _property: PropertyRow,
  destination: Destination,
): Promise<AdapterResult> {
  const envPrefix = destination === "mazad" ? "MAZAD" : "PROPERTY_FINDER";
  const configured =
    !!Deno.env.get(`${envPrefix}_API_URL`) && !!Deno.env.get(`${envPrefix}_API_KEY`);
  if (!configured)
    return {
      ok: false,
      error: `No ${destination === "mazad" ? "Mazad Qatar" : "Property Finder"} credentials configured.`,
    };
  return {
    ok: false,
    error:
      "Credentials configured, but no API specification supplied yet to build the real unpublish request.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const caller = await resolveActiveCaller(req, supabase);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  if (!hasPermission(caller.teamMember, "properties", "publish")) {
    return json({ error: "Not authorized to publish properties" }, 403);
  }

  let body: { property_id?: string; destination?: Destination; action?: "publish" | "unpublish" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { property_id, destination, action } = body;
  if (
    !property_id ||
    !destination ||
    !["mazad", "property_finder"].includes(destination) ||
    !["publish", "unpublish"].includes(action ?? "")
  ) {
    return json(
      {
        error:
          "property_id, destination ('mazad'|'property_finder') and action ('publish'|'unpublish') are required",
      },
      400,
    );
  }

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("*")
    .eq("id", property_id)
    .maybeSingle();
  if (propErr) return json({ error: propErr.message }, 500);
  if (!property) return json({ error: "Property not found" }, 404);

  const statusCol = destination === "mazad" ? "mazad_status" : "property_finder_status";
  const errorCol = destination === "mazad" ? "mazad_error" : "property_finder_error";
  const externalIdCol =
    destination === "mazad" ? "mazad_external_id" : "property_finder_external_id";
  const syncedAtCol = destination === "mazad" ? "mazad_synced_at" : "property_finder_synced_at";

  // Mark queued immediately so the UI reflects the in-flight attempt even
  // though this function currently resolves synchronously.
  await supabase
    .from("properties")
    .update({ [statusCol]: "queued", [errorCol]: null })
    .eq("id", property_id);

  const result =
    action === "publish"
      ? destination === "mazad"
        ? await publishToMazad(property as PropertyRow)
        : await publishToPropertyFinder(property as PropertyRow)
      : await unpublishFromDestination(property as PropertyRow, destination);

  if (result.ok) {
    await supabase
      .from("properties")
      .update({
        [statusCol]: action === "publish" ? "published" : "unpublished",
        [errorCol]: null,
        [externalIdCol]: action === "publish" ? result.externalId : null,
        [syncedAtCol]: new Date().toISOString(),
      })
      .eq("id", property_id);
    return json({ ok: true, status: action === "publish" ? "published" : "unpublished" });
  }

  await supabase
    .from("properties")
    .update({
      [statusCol]: "failed",
      [errorCol]: result.error,
      [syncedAtCol]: new Date().toISOString(),
    })
    .eq("id", property_id);
  return json({ ok: false, status: "failed", error: result.error });
});
