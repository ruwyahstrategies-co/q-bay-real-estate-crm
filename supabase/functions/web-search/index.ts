// Server-side web research. Manual refresh only.
// Tavily is the only search provider. Never returns the raw API key.
// Stores results in external_market_sources.

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

type SearchResult = {
  title: string;
  url: string;
  content: string;
  publisher?: string;
};

async function tavilySearch(query: string, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? r.url,
    url: r.url,
    content: r.content ?? "",
    publisher: tryHost(r.url),
  }));
}

function tryHost(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

async function fetchPageSummary(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 BuyerIntelligenceBot/1.0" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    const html = (await res.text()).slice(0, 80_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1200);
  } catch {
    return null;
  }
}

// crude location / type / price extraction
const PRICE_RE = /(?:AED|QAR|USD|EUR|GBP|SAR|\$)\s?[\d,]{4,}/gi;

function extractPriceInfo(text: string): Record<string, unknown> | null {
  const matches = text.match(PRICE_RE);
  if (!matches || matches.length === 0) return null;
  return { sample_mentions: matches.slice(0, 4) };
}

function matchAny(text: string, terms: string[]): string[] {
  const t = text.toLowerCase();
  return Array.from(new Set(terms.filter((term) => term && t.includes(term.toLowerCase()))));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!await checkRateLimit(req, supabase, "web-search", 6)) return tooManyRequests(CORS);

  const tavily = Deno.env.get("TAVILY_API_KEY");
  if (!tavily) {
    return json({
      error: "Web search provider is not configured. Add TAVILY_API_KEY in Supabase Edge Function secrets.",
      code: "no_provider",
    }, 503);
  }

  const auth = await authorizeCaller(req, supabase, [{ module: "property_demand", action: "view" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // Mode A: ingest a specific URL
  if (body?.url && typeof body.url === "string") {
    const url = body.url.trim();
    if (!/^https?:\/\//i.test(url)) return json({ error: "Invalid URL" }, 400);
    const summary = (await fetchPageSummary(url)) ?? "Page could not be summarised automatically.";
    const title = summary.slice(0, 80) || url;
    const row = {
      query: body.query ?? null,
      title,
      publisher: tryHost(url),
      url,
      summary,
      relevant_locations: [],
      relevant_property_types: [],
      price_info: extractPriceInfo(summary),
      raw: { source: "manual" },
      retrieved_at: new Date().toISOString(),
      active: true,
    };
    const { error } = await supabase
      .from("external_market_sources")
      .upsert(row, { onConflict: "url" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, inserted: 1 });
  }

  // Mode B: query-based search
  const query: string = body?.query;
  if (!query || typeof query !== "string") return json({ error: "query required" }, 400);

  const locationsHint: string[] = Array.isArray(body?.locations) ? body.locations : [];
  const typesHint: string[] = Array.isArray(body?.property_types) ? body.property_types : [];

  let results: SearchResult[];
  try {
    results = await tavilySearch(query, tavily);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  if (results.length === 0) return json({ ok: true, inserted: 0, results: [] });

  const rows = results.map((r) => ({
    query,
    title: r.title.slice(0, 240),
    publisher: r.publisher ?? null,
    url: r.url,
    summary: r.content.slice(0, 1200),
    relevant_locations: matchAny(r.content, locationsHint),
    relevant_property_types: matchAny(r.content, typesHint),
    price_info: extractPriceInfo(r.content),
    raw: { provider: "tavily" },
    retrieved_at: new Date().toISOString(),
    active: true,
  }));

  const { error } = await supabase
    .from("external_market_sources")
    .upsert(rows, { onConflict: "url" });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, inserted: rows.length, provider: "tavily" });
});
