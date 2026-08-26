// Marketing & Brand Intelligence — objective-driven analysis.
// Modes: 'strategy' (default) | 'brand_gap'

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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.6";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_INPUT_CHARS = 70_000;
const MAX_OUTPUT_TOKENS = 4000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function clip(s: string | null | undefined, n: number) { if (!s) return ""; return s.length > n ? s.slice(0, n) + "…" : s; }
function stripPII(text: string): string {
  if (!text) return "";
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]")
    .replace(/https?:\/\/\S+/g, "[link]");
}

const OBJECTIVE_PLAYBOOKS: Record<string, string> = {
  customer_reach: "Increase customer reach. Focus on wider distribution, channel expansion, shareable content, search visibility, partnerships, audience education, broad-interest property topics, and repeated questions that could attract new audiences.",
  luxury: "Attract luxury buyers. Focus on quality perception, exclusivity, presentation, photography, premium service, curated inventory, private viewings, high-quality publications, premium locations, partnerships. Remove generic / discount-focused messaging.",
  qualified_leads: "Generate more qualified leads. Focus on better qualification, budget clarity, buyer intent, financing readiness, property-specific landing pages, stronger calls to action.",
  promote_area: "Promote a specific area. Focus on neighbourhood-specific stories, local lifestyle, community trust, area-specific search content, partnerships with local services.",
  promote_type: "Promote a specific property type. Focus on the use-cases, buyer profile fit, and educational content for that type.",
  investor: "Increase investor interest. Focus on rental yield, developer history, payment plans, occupancy demand, exit potential, market evidence.",
  brand_trust: "Improve brand trust. Focus on testimonials, verified inventory, transparency, agent credentials, clear processes, public reviews.",
  move_inventory: "Move slow inventory. Focus on identifying friction points (price, location, presentation), repositioning messaging, targeted offers, alternative buyer segments.",
  new_launch: "Support a new property launch. Focus on early-bird positioning, developer story, launch event ideas, content calendar.",
  custom: "Address the user-supplied custom objective.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!await checkRateLimit(req, supabase, "market-intelligence", 4)) return tooManyRequests(CORS);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider not configured" }, 500);

  const auth = await authorizeCaller(req, supabase, [{ module: "marketing_intelligence", action: "view" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const mode: "strategy" | "brand_gap" = body?.mode === "brand_gap" ? "brand_gap" : "strategy";
  const objective: string = body?.objective || "customer_reach";
  const customObjective: string = body?.custom_objective || "";
  const focus = body?.focus || {};
  const period = body?.period || { kind: "month" };

  const periodStart = computePeriodStart(period);

  const sinceIso = periodStart.toISOString();
  const [iRes, uRes, aRes, eRes, pRes, sRes, lRes, bRes] = await Promise.all([
    supabase.from("interactions").select("id, interaction_type, direction, content, subject, interaction_date, lead_id").not("content","is",null).gte("interaction_date", sinceIso).order("interaction_date",{ascending:false}).limit(300),
    supabase.from("uploads").select("id, category, extracted_text, lead_id, created_at").eq("processing_status","completed").not("extracted_text","is",null).gte("created_at", sinceIso).order("created_at",{ascending:false}).limit(150),
    supabase.from("ai_analyses").select("id, lead_id, output_json, created_at").eq("status","completed").gte("created_at", sinceIso).order("created_at",{ascending:false}).limit(200),
    supabase.from("property_events").select("property_id, event_type, weight, occurred_at").gte("occurred_at", sinceIso).limit(5000),
    supabase.from("properties").select("id, title, reference_code, property_type, location, price, currency, availability").eq("status","active").limit(400),
    supabase.from("external_market_sources").select("id, title, publisher, url, summary, query, retrieved_at, raw").eq("active",true).order("retrieved_at",{ascending:false}).limit(60),
    supabase.from("leads").select("id, lead_source, preferred_locations, preferred_property_types, status, created_at").gte("created_at", sinceIso).limit(500),
    supabase.from("app_settings").select("setting_value").eq("setting_key","brand_profile").maybeSingle(),
  ]);

  const interactions = iRes.data ?? [];
  const uploads = uRes.data ?? [];
  const analyses = aRes.data ?? [];
  const events = eRes.data ?? [];
  const properties = pRes.data ?? [];
  const sources = sRes.data ?? [];
  const leadsAll = lRes.data ?? [];
  const brandProfile = (bRes.data?.setting_value as any) ?? null;

  const leadCount = leadsAll.length;
  const convoLeadIds = new Set<string>();
  for (const i of interactions as any[]) if (i.lead_id) convoLeadIds.add(i.lead_id);
  for (const u of uploads as any[]) if (u.lead_id) convoLeadIds.add(u.lead_id);
  const conversationCount = interactions.length + uploads.length;
  const meaningful = convoLeadIds.size;
  const label = meaningful >= 15 ? "pattern_analysis" : "early_signals";

  const propMap = new Map<string, any>();
  for (const p of properties as any[]) propMap.set(p.id, p);
  const demandByProp = new Map<string, { score: number; events: Record<string, number> }>();
  for (const e of events as any[]) {
    if (!e.property_id) continue;
    const cur = demandByProp.get(e.property_id) ?? { score: 0, events: {} };
    cur.score += Number(e.weight ?? 1);
    cur.events[e.event_type] = (cur.events[e.event_type] ?? 0) + 1;
    demandByProp.set(e.property_id, cur);
  }
  const topDemand = Array.from(demandByProp.entries())
    .map(([pid, v]) => { const p = propMap.get(pid); return p ? { ref: `property:${pid}`, code: p.reference_code, title: p.title, type: p.property_type, location: p.location, price: p.price, score: v.score, events: v.events } : null; })
    .filter(Boolean).sort((a: any, b: any) => b.score - a.score).slice(0, 12);

  const convoSnips = (interactions as any[]).slice(0, 80).map((i) => ({
    ref: `interaction:${i.id}`, channel: i.interaction_type, direction: i.direction,
    subject: stripPII(clip(i.subject, 120)), text: stripPII(clip(i.content, 700)),
  }));
  const uploadSnips = (uploads as any[]).slice(0, 25).map((u) => ({
    ref: `upload:${u.id}`, category: u.category, text: stripPII(clip(u.extracted_text, 1500)),
  }));

  const objections = countLabels((analyses as any[]).flatMap((a) => (a.output_json?.pain_points ?? a.output_json?.objections ?? []).map((o: any) => o?.concern ?? o?.label)));
  const motivations = countLabels((analyses as any[]).flatMap((a) => a.output_json?.deep_analysis?.motivations?.map((m: any) => m.label) ?? a.output_json?.motivations?.map((m: any) => m.label) ?? []));
  const wantsLocations = countLabels((analyses as any[]).flatMap((a) => a.output_json?.buyer_summary?.preferred_locations ?? a.output_json?.propertyMatchingCriteria?.locations ?? []));
  const wantsTypes = countLabels((analyses as any[]).flatMap((a) => [a.output_json?.buyer_summary?.property_type].filter(Boolean)));
  const leadSourceCounts = countLabels((leadsAll as any[]).map((l) => l.lead_source).filter(Boolean));

  const externalSources = (sources as any[]).map((s) => ({
    ref: `source:${s.id}`, title: s.title, publisher: s.publisher, url: s.url,
    summary: clip(s.summary, 400), query: s.query,
    is_brand: (s.raw && (s.raw as any).source_type === "brand") || (s.query ?? "").startsWith("brand:"),
  }));

  const objectiveText = objective === "custom" && customObjective ? customObjective : (OBJECTIVE_PLAYBOOKS[objective] ?? OBJECTIVE_PLAYBOOKS.customer_reach);

  const aggregateInput = {
    meta: { objective, custom_objective: customObjective, focus, period, periodStart: sinceIso, meaningfulConversations: meaningful, conversationCount, activeLeads: leadCount, label, mode },
    brandProfile,
    aggregates: { objections, motivations, locations: wantsLocations, propertyTypes: wantsTypes, leadSourceCounts },
    propertyDemand: topDemand,
    conversations: convoSnips,
    uploadedConversations: uploadSnips,
    externalSources,
  };

  let inputBody = JSON.stringify(aggregateInput);
  while (inputBody.length > MAX_INPUT_CHARS && aggregateInput.conversations.length > 5) {
    aggregateInput.conversations.pop();
    inputBody = JSON.stringify(aggregateInput);
  }
  while (inputBody.length > MAX_INPUT_CHARS && aggregateInput.uploadedConversations.length > 0) {
    aggregateInput.uploadedConversations.pop();
    inputBody = JSON.stringify(aggregateInput);
  }

  const { data: created, error: createErr } = await supabase
    .from("market_intelligence_reports").insert({
      status: "processing", label, conversation_count: conversationCount,
      lead_count: leadCount, model: MODEL,
      input_snapshot: aggregateInput.meta,
      source_ids: (sources as any[]).map((s) => s.id),
    }).select().single();
  if (createErr || !created) return json({ error: "Failed to create report" }, 500);

  const COMMON_RULES = `
- Use ONLY the supplied data. Never invent statistics, trends or quotes.
- Cite evidence with refs from the input: "interaction:<id>", "upload:<id>", "property:<id>", "source:<id>".
- Tag each finding's evidence_tags with the source type: "internal_buyer" | "property_demand" | "online_brand" | "external_market".
- PII is already stripped; do NOT include names, phones or emails.
- Never claim a market trend unless an externalSources source backs it with a matching source ref.
- With fewer than 15 meaningful conversations use cautious language: "early signal", "emerging pattern", "directional insight", "requires more data".
- Distribution recommendations must explain WHY the channel fits the objective and audience.
- Return STRICTLY a single JSON object matching the schema. No markdown, no prose, no code fences.`;

  const STRATEGY_SCHEMA = `{
  "period_focus": { "objective": string, "topic": string, "period_label": string },
  "buyer_language": [{ "finding": string, "evidence_tags": [string], "refs": [string] }],
  "brand_gaps": [{ "gap": string, "evidence_tags": [string], "refs": [string] }],
  "recommended_direction": string,
  "campaign_ideas": [{
    "angle": string, "audience": string, "problem": string,
    "channel": string, "channel_reason": string,
    "related_property_refs": [string], "evidence_tags": [string], "refs": [string]
  }],
  "actions_this_week": [{ "action": string, "why": string, "evidence_tags": [string], "refs": [string] }],
  "label": "early_signals" | "pattern_analysis"
}`;

  const BRAND_GAP_SCHEMA = `{
  "current_online_positioning": string,
  "buyer_perception": string,
  "positioning_gap": string,
  "recommended_positioning": string,
  "messaging_changes": {
    "website_headline": string,
    "campaign_angle": string,
    "social_direction": string,
    "sales_talking_point": string,
    "trust_signal_to_add": string,
    "missing_information": string
  },
  "distribution_recommendation": [{ "channel": string, "reason": string, "evidence_tags": [string], "refs": [string] }],
  "evidence": [{ "claim": string, "refs": [string], "evidence_tags": [string] }]
}`;

  const SYSTEM = `You are a senior marketing strategist for a real estate agency.
Your selected business objective: ${objectiveText}
${focus?.location ? `Optional focus — location: ${focus.location}` : ""}
${focus?.property_type ? `Optional focus — property type: ${focus.property_type}` : ""}
${focus?.buyer_segment ? `Optional focus — buyer segment: ${focus.buyer_segment}` : ""}
${focus?.property_id ? `Optional focus — specific property id: ${focus.property_id}` : ""}
${focus?.campaign ? `Optional focus — campaign: ${focus.campaign}` : ""}
${focus?.topic ? `Optional focus — topic: ${focus.topic}` : ""}
${COMMON_RULES}`;

  const userTask = mode === "brand_gap"
    ? `Compare three layers: (1) what the company says online (brandProfile + externalSources where is_brand=true), (2) what buyers say across conversations/uploads/aggregates, (3) the selected objective. Identify the positioning gap and recommend concise messaging changes and distribution. Match the schema:\n${BRAND_GAP_SCHEMA}`
    : `Produce a short, operational marketing strategy aligned to the objective. Keep buyer_language ≤5, brand_gaps ≤3, campaign_ideas ≤5, actions_this_week ≤5. Match the schema:\n${STRATEGY_SCHEMA}`;

  const USER = `Aggregate input (JSON):\n${inputBody}\n\n${userTask}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_SITE_URL") || "https://qbayrealestate.com",
        "X-Title": "Marketing Intelligence",
      },
      body: JSON.stringify({
        model: MODEL, temperature: 0.3, max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: USER },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await res.text();
    if (!res.ok) {
      const safe = res.status === 401 ? "AI provider authentication failed"
        : res.status === 402 ? "AI provider credits exhausted"
        : res.status === 429 ? "AI provider rate limit reached"
        : "AI provider request failed";
      throw new Error(safe);
    }
    const data = JSON.parse(txt);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");
    let parsed: any;
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(m[0]);
    }
    const wrapped = { mode, objective, custom_objective: customObjective, focus, period, ...parsed };
    await supabase.from("market_intelligence_reports").update({
      status: "completed", output_json: wrapped, label,
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ id: created.id, status: "completed", output: wrapped, label });
  } catch (e) {
    const msg = (e as Error).message || "Failed";
    await supabase.from("market_intelligence_reports").update({
      status: "failed", error_message: msg.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ error: msg, id: created.id }, 502);
  }
});

function countLabels(items: any[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    const k = String(it).trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([label, count]) => ({ label, count }));
}

function computePeriodStart(period: any): Date {
  const now = new Date();
  if (period?.kind === "custom" && period?.start) {
    const d = new Date(period.start);
    if (!isNaN(d.getTime())) return d;
  }
  if (period?.kind === "week") return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  if (period?.kind === "90d") return new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  // default month
  return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
}
