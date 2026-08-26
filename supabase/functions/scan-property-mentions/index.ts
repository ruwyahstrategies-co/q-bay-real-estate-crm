// Scans interactions and upload extracted_text for references to known
// properties (by title or reference_code). Inserts 'mention' rows into
// property_events, deduplicating by (property_id, source_ref).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = { id: string; user_id: string | null; is_active: boolean | null; role: string | null; permissions: Record<string, string[]> | null };
type ResolvedCaller = { ok: true; userId: string; email: string | null; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };
async function resolveActiveCaller(req: Request, serviceClient: SupabaseClient): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };
  const user = userData.user;
  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members").select("id, user_id, is_active, role, permissions").eq("user_id", user.id).maybeSingle();
  if (memberErr) return { ok: false, status: 500, error: "Failed to resolve staff record" };
  if (!teamMember) return { ok: false, status: 403, error: "Account not provisioned. Ask an administrator to create your staff login." };
  if (teamMember.is_active === false) return { ok: false, status: 403, error: "Account is inactive." };
  return { ok: true, userId: user.id, email: user.email ?? null, teamMember: teamMember as TeamMemberRow };
}
function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}
async function authorizeCaller(req: Request, serviceClient: SupabaseClient, checks: { module: string; action: string }[]) {
  const resolved = await resolveActiveCaller(req, serviceClient);
  if (!resolved.ok) return resolved;
  for (const { module: moduleKey, action } of checks) {
    if (!hasPermission(resolved.teamMember, moduleKey, action)) return { ok: false as const, status: 403, error: `Missing permission: ${moduleKey}.${action}` };
  }
  return { ok: true as const, userId: resolved.userId, email: resolved.email, teamMember: resolved.teamMember };
}
async function checkRateLimit(req: Request, service: SupabaseClient, fnName: string, maxPerMinute: number): Promise<boolean> {
  try {
    const xf = req.headers.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0].trim() : req.headers.get("cf-connecting-ip") || "anon";
    const [{ data: ipOk }, { data: globalOk }] = await Promise.all([
      service.rpc("check_rate_limit", { _key: `${fnName}:ip:${ip}`, _max_per_minute: maxPerMinute }),
      service.rpc("check_rate_limit", { _key: `${fnName}:global`, _max_per_minute: maxPerMinute * 10 }),
    ]);
    return ipOk !== false && globalOk !== false;
  } catch { return true; }
}
function tooManyRequests(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function esc(s: string) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!await checkRateLimit(req, supabase, "scan-property-mentions", 4)) return tooManyRequests(CORS);

  const auth = await authorizeCaller(req, supabase, [{ module: "property_demand", action: "view" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const { data: properties = [] } = await supabase
    .from("properties")
    .select("id, title, reference_code")
    .eq("status", "active");

  if (properties.length === 0) return json({ ok: true, inserted: 0, reason: "no_active_properties" });

  // Build matchers (word-boundary on reference_code; case-insensitive substring on title >= 4 chars)
  type Matcher = { property_id: string; regex: RegExp; label: string };
  const matchers: Matcher[] = [];
  for (const p of properties as any[]) {
    if (p.reference_code && p.reference_code.length >= 2) {
      matchers.push({
        property_id: p.id,
        regex: new RegExp(`\\b${esc(p.reference_code)}\\b`, "i"),
        label: p.reference_code,
      });
    }
    if (p.title && p.title.length >= 4) {
      matchers.push({
        property_id: p.id,
        regex: new RegExp(`${esc(p.title)}`, "i"),
        label: p.title,
      });
    }
  }

  // Existing mention source_refs to dedupe
  const { data: existing = [] } = await supabase
    .from("property_events")
    .select("property_id, source_ref")
    .eq("event_type", "mention");
  const existingKeys = new Set(
    (existing as any[]).map((e) => `${e.property_id}::${e.source_ref ?? ""}`),
  );

  const toInsert: any[] = [];

  // Scan interactions
  const { data: interactions = [] } = await supabase
    .from("interactions")
    .select("id, lead_id, interaction_type, content, subject, interaction_date")
    .not("content", "is", null)
    .limit(2000);

  for (const i of interactions as any[]) {
    const text = `${i.subject ?? ""}\n${i.content ?? ""}`;
    if (!text.trim()) continue;
    const matched = new Set<string>();
    for (const m of matchers) {
      if (matched.has(m.property_id)) continue;
      if (m.regex.test(text)) matched.add(m.property_id);
    }
    for (const pid of matched) {
      const ref = `interaction:${i.id}`;
      const key = `${pid}::${ref}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toInsert.push({
        property_id: pid,
        lead_id: i.lead_id ?? null,
        event_type: "mention",
        source: i.interaction_type ?? "interaction",
        source_ref: ref,
        weight: 1.5,
        occurred_at: i.interaction_date ?? new Date().toISOString(),
        metadata: { from: "interaction" },
      });
    }
  }

  // Scan uploads (extracted_text)
  const { data: uploads = [] } = await supabase
    .from("uploads")
    .select("id, lead_id, category, extracted_text, created_at, processing_status")
    .eq("processing_status", "completed")
    .not("extracted_text", "is", null)
    .limit(1000);

  for (const u of uploads as any[]) {
    const text: string = u.extracted_text ?? "";
    if (text.length < 10) continue;
    const matched = new Set<string>();
    for (const m of matchers) {
      if (matched.has(m.property_id)) continue;
      if (m.regex.test(text)) matched.add(m.property_id);
    }
    for (const pid of matched) {
      const ref = `upload:${u.id}`;
      const key = `${pid}::${ref}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toInsert.push({
        property_id: pid,
        lead_id: u.lead_id ?? null,
        event_type: "mention",
        source: u.category ?? "upload",
        source_ref: ref,
        weight: 1.5,
        occurred_at: u.created_at,
        metadata: { from: "upload" },
      });
    }
  }

  if (toInsert.length === 0) return json({ ok: true, inserted: 0 });

  // Insert in chunks
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { error, count } = await supabase
      .from("property_events")
      .insert(chunk, { count: "exact" });
    if (error) return json({ error: error.message, inserted }, 500);
    inserted += count ?? chunk.length;
  }

  return json({ ok: true, inserted, scanned: { interactions: interactions.length, uploads: uploads.length } });
});
