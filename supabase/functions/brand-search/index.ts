// Search Your Brand Online — anonymous, manual trigger.
// Uses Tavily (TAVILY_API_KEY) when present. Caches results in external_market_sources.

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
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function host(u: string) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; } }

async function tavily(query: string, key: string, maxResults = 6): Promise<any[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "basic", max_results: maxResults }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? r.url, url: r.url, content: r.content ?? "",
    published_at: r.published_date ?? null, publisher: host(r.url),
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!await checkRateLimit(req, supabase, "brand-search", 3)) return tooManyRequests(CORS);

  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) return json({ error: "Web search provider is not configured. Add TAVILY_API_KEY." }, 503);

  const auth = await authorizeCaller(req, supabase, [{ module: "marketing_intelligence", action: "view" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const brand: string = (body?.brand_name ?? "").trim();
  if (!brand) return json({ error: "brand_name required" }, 400);
  const website: string = (body?.website ?? "").trim();
  const handles: string[] = Array.isArray(body?.social_handles) ? body.social_handles.filter(Boolean) : [];
  const location: string = (body?.location ?? "").trim();
  const services: string[] = Array.isArray(body?.services) ? body.services.filter(Boolean) : [];
  const competitors: string[] = Array.isArray(body?.competitors) ? body.competitors.filter(Boolean) : [];

  const domain = website.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const queries: { tag: string; q: string }[] = [];
  queries.push({ tag: `brand:overview`, q: `${brand} ${location} real estate` });
  if (domain) queries.push({ tag: `brand:site`, q: `site:${domain}` });
  queries.push({ tag: `brand:reviews`, q: `"${brand}" reviews ${location}` });
  for (const h of handles.slice(0, 2)) {
    const clean = h.replace(/^@/, "");
    queries.push({ tag: `brand:social`, q: `${clean} instagram OR linkedin ${brand}` });
  }
  for (const s of services.slice(0, 2)) queries.push({ tag: `brand:service`, q: `${brand} ${s}` });
  for (const c of competitors.slice(0, 3)) queries.push({ tag: `brand:competitor`, q: `${c} ${location} real estate reviews` });

  const all: any[] = [];
  const errors: string[] = [];
  for (const { tag, q } of queries) {
    try {
      const items = await tavily(q, apiKey, 5);
      for (const it of items) all.push({ ...it, query_tag: tag, query: q });
    } catch (e) {
      errors.push(`${tag}: ${(e as Error).message}`);
    }
  }

  // dedupe by URL
  const seen = new Set<string>();
  const rows = [];
  for (const r of all) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    rows.push({
      query: `brand:${r.query_tag.replace("brand:", "")}`,
      title: String(r.title).slice(0, 240),
      publisher: r.publisher ?? null,
      url: r.url,
      summary: String(r.content).slice(0, 1200),
      relevant_locations: location ? [location] : [],
      relevant_property_types: [],
      raw: { source_type: "brand", brand, query: r.query, query_tag: r.query_tag, published_at: r.published_at },
      retrieved_at: new Date().toISOString(),
      active: true,
    });
  }
  if (rows.length === 0) {
    return json({ ok: true, inserted: 0, errors });
  }
  const { error } = await supabase.from("external_market_sources").upsert(rows, { onConflict: "url" });
  if (error) return json({ error: error.message, errors }, 500);
  return json({ ok: true, inserted: rows.length, errors });
});
