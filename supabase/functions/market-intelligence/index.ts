// Marketing & Brand Intelligence — aggregates anonymised buyer signals
// across leads + property demand + external market sources, then calls
// OpenRouter (anthropic/claude-sonnet-4.6 by default) for structured output.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clip(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function stripPII(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]")
    .replace(/https?:\/\/\S+/g, "[link]");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider not configured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Gather inputs
  const [{ data: interactions = [] }, { data: uploads = [] }, { data: analyses = [] }, { data: events = [] }, { data: properties = [] }, { data: sources = [] }, { data: leadsAll = [] }] = await Promise.all([
    supabase.from("interactions").select("id, interaction_type, direction, content, subject, interaction_date, lead_id").not("content", "is", null).order("interaction_date", { ascending: false }).limit(400),
    supabase.from("uploads").select("id, category, extracted_text, lead_id, created_at").eq("processing_status", "completed").not("extracted_text", "is", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("ai_analyses").select("id, lead_id, output_json, created_at").eq("status", "completed").order("created_at", { ascending: false }).limit(300),
    supabase.from("property_events").select("property_id, event_type, weight, occurred_at").gte("occurred_at", new Date(Date.now() - 90*24*3600*1000).toISOString()).limit(5000),
    supabase.from("properties").select("id, title, reference_code, property_type, location, price, currency, availability").eq("status", "active").limit(500),
    supabase.from("external_market_sources").select("id, title, publisher, url, summary, relevant_locations, relevant_property_types, retrieved_at").eq("active", true).order("retrieved_at", { ascending: false }).limit(40),
    supabase.from("leads").select("id, lead_source, preferred_locations, preferred_property_types, budget_min, budget_max, currency, buying_timeline, status").eq("status", "active").limit(500),
  ]);

  // Lightweight aggregations
  const leadCount = leadsAll.length;
  const conversationLeadIds = new Set<string>();
  for (const i of interactions as any[]) if (i.lead_id) conversationLeadIds.add(i.lead_id);
  for (const u of uploads as any[]) if (u.lead_id) conversationLeadIds.add(u.lead_id);
  const conversationCount = (interactions.length + uploads.length);
  const meaningfulCount = conversationLeadIds.size;
  const label = meaningfulCount >= 15 ? "pattern_analysis" : "early_signals";

  // Demand aggregation
  const propMap = new Map<string, any>();
  for (const p of properties as any[]) propMap.set(p.id, p);
  const demandByProperty = new Map<string, { score: number; events: Record<string, number> }>();
  for (const e of events as any[]) {
    if (!e.property_id) continue;
    const cur = demandByProperty.get(e.property_id) ?? { score: 0, events: {} };
    cur.score += Number(e.weight ?? 1);
    cur.events[e.event_type] = (cur.events[e.event_type] ?? 0) + 1;
    demandByProperty.set(e.property_id, cur);
  }
  const topDemand = Array.from(demandByProperty.entries())
    .map(([pid, v]) => {
      const p = propMap.get(pid);
      return p ? {
        ref: `property:${pid}`,
        title: p.title, type: p.property_type, location: p.location,
        price: p.price, currency: p.currency, score: v.score, events: v.events,
      } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 12);

  // Anonymised conversation snippets
  const convoSnips = (interactions as any[]).slice(0, 80).map((i, idx) => ({
    ref: `interaction:${idx}`,
    channel: i.interaction_type,
    direction: i.direction,
    subject: stripPII(clip(i.subject, 120)),
    text: stripPII(clip(i.content, 800)),
  }));
  const uploadSnips = (uploads as any[]).slice(0, 30).map((u, idx) => ({
    ref: `upload:${idx}`,
    category: u.category,
    text: stripPII(clip(u.extracted_text, 1500)),
  }));

  // Analysis aggregates
  const objections = countLabels((analyses as any[]).flatMap((a) => (a.output_json?.objections ?? []).map((o: any) => o.label)));
  const motivations = countLabels((analyses as any[]).flatMap((a) => (a.output_json?.motivations ?? []).map((m: any) => m.label)));
  const locations = countLabels((analyses as any[]).flatMap((a) => a.output_json?.propertyMatchingCriteria?.locations ?? []));
  const propertyTypes = countLabels((analyses as any[]).flatMap((a) => a.output_json?.propertyMatchingCriteria?.propertyTypes ?? []));
  const riskLabels = countLabels((analyses as any[]).flatMap((a) => (a.output_json?.risks ?? []).map((r: any) => r.risk)));

  // Lead source distribution
  const leadSourceCounts = countLabels((leadsAll as any[]).map((l) => l.lead_source).filter(Boolean));

  // External sources (cited)
  const externalSources = (sources as any[]).map((s) => ({
    ref: `source:${s.id}`,
    title: s.title, publisher: s.publisher, url: s.url,
    summary: clip(s.summary, 500),
    locations: s.relevant_locations, types: s.relevant_property_types,
  }));

  const aggregateInput = {
    meta: {
      meaningfulConversations: meaningfulCount,
      conversationCount,
      activeLeads: leadCount,
      label,
      windowDays: 90,
    },
    aggregates: {
      objections, motivations, locations, propertyTypes, riskLabels, leadSourceCounts,
    },
    propertyDemand: topDemand,
    conversations: convoSnips,
    uploadedConversations: uploadSnips,
    externalSources,
  };

  let body = JSON.stringify(aggregateInput);
  if (body.length > MAX_INPUT_CHARS) {
    // Drop the lower-value snippets first
    aggregateInput.uploadedConversations = aggregateInput.uploadedConversations.slice(0, 10);
    aggregateInput.conversations = aggregateInput.conversations.slice(0, 40);
    body = JSON.stringify(aggregateInput);
  }
  while (body.length > MAX_INPUT_CHARS && aggregateInput.conversations.length > 5) {
    aggregateInput.conversations.pop();
    body = JSON.stringify(aggregateInput);
  }

  // Create row first
  const { data: created, error: createErr } = await supabase
    .from("market_intelligence_reports")
    .insert({
      status: "processing",
      label,
      conversation_count: conversationCount,
      lead_count: leadCount,
      model: MODEL,
      input_snapshot: aggregateInput.meta,
      source_ids: (sources as any[]).map((s) => s.id),
    })
    .select()
    .single();
  if (createErr || !created) return json({ error: "Failed to create report" }, 500);

  const SYSTEM = `You are a marketing strategist analysing real estate buyer signals.

Rules:
- Use ONLY the supplied data. Do not invent statistics, market trends, or buyer quotes.
- Cite supporting evidence using the "ref" strings in the input (e.g. "interaction:3", "upload:1", "property:abc", "source:xyz").
- Do not include buyer names, phone numbers or email addresses (PII is already stripped — keep it that way).
- Never claim a market trend or price movement unless an "externalSources" entry supports it; cite the matching source ref.
- When fewer than 15 meaningful conversations exist, use cautious language: "emerging pattern", "early signal", "requires more data".
- Return STRICTLY a single JSON object that matches the requested schema. No markdown, no prose, no code fences.`;

  const USER = `Aggregate input (JSON):
${body}

Return a JSON object exactly matching:
{
 "label": "early_signals" | "pattern_analysis",
 "summary": string,
 "commonBuyerNeeds": [{"need": string, "supportCount": number, "evidenceReferences": [string]}],
 "commonObjections": [{"objection": string, "supportCount": number, "evidenceReferences": [string]}],
 "requestedFeatures": [string],
 "growingInterest": [{"topic": string, "evidenceReferences": [string]}],
 "lostInterestReasons": [{"reason": string, "evidenceReferences": [string]}],
 "languagePatterns": [string],
 "trustBuilders": [string],
 "hesitationTriggers": [string],
 "marketingGaps": [{"gap": string, "evidenceReferences": [string]}],
 "positioningImprovements": [{
   "finding": string, "evidence": string, "recommendation": string,
   "confidence": "low|medium|high", "evidenceReferences": [string]
 }],
 "marketingIdeas": [{
   "topic": string, "targetBuyer": string, "buyerProblem": string,
   "format": string, "supportingPattern": string,
   "relatedPropertyRefs": [string], "evidenceReferences": [string]
 }],
 "brandFixes": [{
   "issue": string, "supportCount": number, "whyItMatters": string,
   "correction": string, "confidence": "low|medium|high",
   "evidenceReferences": [string]
 }],
 "campaignOpportunities": [{
   "opportunity": string, "internalDemandRef": [string],
   "externalSourceRefs": [string], "recommendation": string,
   "confidence": "low|medium|high"
 }]
}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.app",
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
    await supabase.from("market_intelligence_reports").update({
      status: "completed",
      output_json: parsed,
      label: parsed?.label === "pattern_analysis" ? "pattern_analysis" : label,
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ id: created.id, status: "completed", output: parsed, label });
  } catch (e) {
    const msg = (e as Error).message || "Failed";
    await supabase.from("market_intelligence_reports").update({
      status: "failed", error_message: msg.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ error: msg, id: created.id }, 502);
  }
});

function countLabels(items: string[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    const k = String(it).trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([label, count]) => ({ label, count }));
}
