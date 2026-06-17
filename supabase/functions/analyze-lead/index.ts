// Anonymous Buyer Intelligence analysis via OpenRouter.
// verify_jwt = false (see supabase/config.toml).
// Uses service-role only inside this function. Never returns the API key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL =
  Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.6";
const SITE_URL =
  Deno.env.get("OPENROUTER_SITE_URL") || "https://lovable.app";
const APP_NAME =
  Deno.env.get("OPENROUTER_APP_NAME") || "Buyer Intelligence";
const MAX_INPUT_CHARS = 60_000;
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 90_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// --- minimal schema validation ---
const STAGES = [
  "new_lead", "contacted", "qualified", "property_matching",
  "viewing_scheduled", "negotiation", "documentation", "won", "lost",
];
const STATUSES = ["cold", "warm", "hot", "at_risk", "unclear"];
const SEVERITIES = ["low", "medium", "high"];
const URGENCY_LEVELS = ["low", "medium", "high", "unknown"];
const BUDGET_STRENGTHS = ["weak", "moderate", "strong", "unknown"];
const IMPORTANCE = ["low", "medium", "high"];
const CHANNELS = ["whatsapp", "email", "phone", "meeting"];

function isStr(v: unknown): v is string { return typeof v === "string"; }
function isNum(v: unknown): v is number { return typeof v === "number" && !isNaN(v); }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
function inRange(v: unknown, lo: number, hi: number) { return isNum(v) && v >= lo && v <= hi; }

function validate(o: any): { ok: true } | { ok: false; errors: string[] } {
  const errs: string[] = [];
  if (!o || typeof o !== "object") return { ok: false, errors: ["root must be object"] };
  if (!isStr(o.summary)) errs.push("summary must be string");
  if (!inRange(o.intentScore, 0, 100)) errs.push("intentScore must be 0-100");
  if (!inRange(o.confidenceScore, 0, 100)) errs.push("confidenceScore must be 0-100");
  if (!STAGES.includes(o.recommendedPipelineStage)) errs.push("recommendedPipelineStage invalid");
  if (!STATUSES.includes(o.buyerStatus)) errs.push("buyerStatus invalid");
  for (const m of arr(o.motivations)) {
    const mm = m as any;
    if (!isStr(mm?.label)) errs.push("motivation.label");
    if (!inRange(mm?.confidence, 0, 100)) errs.push("motivation.confidence 0-100");
  }
  for (const x of arr(o.objections)) {
    if (!SEVERITIES.includes((x as any)?.severity)) errs.push("objection.severity");
  }
  if (o.urgency && !URGENCY_LEVELS.includes(o.urgency.level)) errs.push("urgency.level");
  if (o.budgetSignals && !BUDGET_STRENGTHS.includes(o.budgetSignals.strength)) errs.push("budgetSignals.strength");
  for (const x of arr(o.decisionFactors)) {
    if (!IMPORTANCE.includes((x as any)?.importance)) errs.push("decisionFactors.importance");
  }
  for (const x of arr(o.risks)) {
    if (!SEVERITIES.includes((x as any)?.severity)) errs.push("risks.severity");
  }
  for (const x of arr(o.nextBestActions)) {
    const xx = x as any;
    if (!Number.isInteger(xx?.priority) || xx.priority < 1) errs.push("nextBestActions.priority");
    if (!isStr(xx?.action)) errs.push("nextBestActions.action");
  }
  if (o.followUpDraft && !CHANNELS.includes(o.followUpDraft.channel)) errs.push("followUpDraft.channel");
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

// --- input preparation ---
function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function buildInput(supabase: any, leadId: string) {
  const sourceIds: string[] = [];
  const excluded: string[] = [];

  const { data: lead, error: leadErr } = await supabase
    .from("leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) throw new Error("lead fetch failed");
  if (!lead) throw new Error("lead not found");
  sourceIds.push("lead_profile");
  if (lead.notes) sourceIds.push("lead_notes");

  const { data: interactions = [] } = await supabase
    .from("interactions").select("*").eq("lead_id", leadId)
    .order("interaction_date", { ascending: false }).limit(40);

  const { data: uploads = [] } = await supabase
    .from("uploads").select("id,filename,category,processing_status,extracted_text,created_at")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20);

  const { data: interests = [] } = await supabase
    .from("lead_property_interests").select("*, properties(*)").eq("lead_id", leadId);

  const { data: prevAnalyses = [] } = await supabase
    .from("ai_analyses").select("id,status,output_json,created_at")
    .eq("lead_id", leadId).eq("status", "completed")
    .order("created_at", { ascending: false }).limit(1);

  const profile = {
    full_name: lead.full_name,
    email: lead.email, phone: lead.phone, nationality: lead.nationality,
    preferred_language: lead.preferred_language,
    lead_source: lead.lead_source, pipeline_stage: lead.pipeline_stage,
    budget_min: lead.budget_min, budget_max: lead.budget_max, currency: lead.currency,
    preferred_locations: lead.preferred_locations,
    preferred_property_types: lead.preferred_property_types,
    bedrooms: lead.bedrooms, purchase_purpose: lead.purchase_purpose,
    buying_timeline: lead.buying_timeline, financing_status: lead.financing_status,
    notes: clip(lead.notes, 4000),
  };

  const intArr = interactions.map((i: any) => {
    sourceIds.push(`interaction:${i.id}`);
    return {
      ref: `interaction:${i.id}`, type: i.interaction_type, direction: i.direction,
      date: i.interaction_date, subject: i.subject, content: clip(i.content, 3000),
    };
  });

  const upArr: any[] = [];
  for (const u of uploads) {
    if (u.processing_status !== "completed" || !u.extracted_text) {
      excluded.push(`upload:${u.id}`); continue;
    }
    sourceIds.push(`upload:${u.id}`);
    upArr.push({
      ref: `upload:${u.id}`, filename: u.filename, category: u.category,
      text: clip(u.extracted_text, 6000),
    });
  }

  const intsArr = interests.map((it: any) => {
    sourceIds.push(`property_interest:${it.id}`);
    return {
      ref: `property_interest:${it.id}`, status: it.interest_level ?? it.status,
      notes: clip(it.notes, 600), property: it.properties ? {
        id: it.properties.id, title: it.properties.title,
        location: it.properties.location, type: it.properties.property_type,
        price: it.properties.price, bedrooms: it.properties.bedrooms,
      } : null,
    };
  });

  let previous: any = null;
  if (prevAnalyses.length) {
    const p = prevAnalyses[0];
    sourceIds.push(`previous_analysis:${p.id}`);
    previous = { ref: `previous_analysis:${p.id}`, date: p.created_at, summary: p.output_json?.summary, intentScore: p.output_json?.intentScore };
  }

  let body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, previousAnalysis: previous });
  let truncated = false;
  while (body.length > MAX_INPUT_CHARS && intArr.length > 5) {
    const removed = intArr.pop();
    if (removed) excluded.push(removed.ref);
    truncated = true;
    body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, previousAnalysis: previous });
  }
  while (body.length > MAX_INPUT_CHARS && upArr.length) {
    const removed = upArr.pop();
    if (removed) excluded.push(removed.ref);
    truncated = true;
    body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, previousAnalysis: previous });
  }

  const hasUsefulSignal =
    !!lead.notes ||
    intArr.length > 0 ||
    upArr.length > 0 ||
    intsArr.length > 0 ||
    !!lead.budget_max || !!lead.budget_min ||
    (lead.preferred_locations?.length ?? 0) > 0 ||
    (lead.preferred_property_types?.length ?? 0) > 0;

  const snapshot = {
    lead_id: leadId,
    body,
    metadata: {
      sourceCount: sourceIds.length,
      characterCount: body.length,
      truncated,
      includedSourceIds: sourceIds,
      excludedSourceIds: excluded,
    },
    hasUsefulSignal,
    leadUpdatedAt: lead.updated_at,
  };
  return snapshot;
}

const SYSTEM_PROMPT = `You are a real estate buyer-intelligence analyst.
Analyse the supplied buyer information and help the sales team decide the next best action.

Rules:
- Use ONLY the supplied information. Do not invent facts, budgets, preferences, timelines, properties, interactions or buyer statements.
- Separate explicit facts from inferred signals. Reference supporting evidence via the "ref" strings shown in the input (e.g. "interaction:abc", "upload:abc", "lead_profile", "lead_notes", "property_interest:abc", "previous_analysis:abc").
- Never use religion, race, ethnicity, health, disability, political beliefs, sexual orientation, gender, family status or nationality as positive or negative purchasing signals.
- Do not interpret missing information as negative evidence; instead, list it under missingInformation.
- Return STRICTLY a single JSON object that matches the requested schema. No prose, no markdown, no code fences, no commentary.`;

function buildUserPrompt(snapshot: string) {
  return `Buyer data (JSON):\n${snapshot}\n\nReturn a JSON object with this exact shape (use null/empty arrays where unknown):
{
 "summary": string,
 "intentScore": 0-100,
 "confidenceScore": 0-100,
 "recommendedPipelineStage": one of ${STAGES.join("|")},
 "buyerStatus": one of ${STATUSES.join("|")},
 "motivations": [{"label":string,"explanation":string,"confidence":0-100,"evidenceReferences":[string]}],
 "objections": [{"label":string,"severity":"low|medium|high","explanation":string,"recommendedResponse":string,"evidenceReferences":[string]}],
 "urgency": {"level":"low|medium|high|unknown","explanation":string,"evidenceReferences":[string]},
 "budgetSignals": {"strength":"weak|moderate|strong|unknown","explanation":string,"evidenceReferences":[string]},
 "decisionFactors": [{"factor":string,"importance":"low|medium|high","evidenceReferences":[string]}],
 "risks": [{"risk":string,"severity":"low|medium|high","explanation":string,"recommendedAction":string,"evidenceReferences":[string]}],
 "propertyMatchingCriteria": {"locations":[string],"propertyTypes":[string],"bedrooms":[number],"budgetMinimum":number|null,"budgetMaximum":number|null,"currency":string|null,"completionStatus":[string],"mustHaveFeatures":[string],"preferredFeatures":[string],"avoidFeatures":[string]},
 "nextBestActions": [{"priority":1,"action":string,"reason":string,"recommendedTiming":string,"relatedLeadId":string|null,"relatedPropertyId":string|null}],
 "followUpDraft": {"channel":"whatsapp|email|phone|meeting","message":string,"objective":string,"tone":string},
 "missingInformation": [{"field":string,"reason":string,"suggestedQuestion":string}],
 "evidenceSummary": [{"claim":string,"sourceReferences":[string]}]
}`;
}

async function callOpenRouter(messages: any[], apiKey: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": APP_NAME,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("OpenRouter error", res.status, text.slice(0, 500));
      const safe = res.status === 401 ? "AI provider authentication failed"
        : res.status === 402 ? "AI provider credits exhausted"
        : res.status === 429 ? "AI provider rate limit reached, try again shortly"
        : res.status >= 500 ? "AI provider temporarily unavailable"
        : "AI provider request failed";
      throw new Error(safe);
    }
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("Empty AI response");
    return content;
  } finally {
    clearTimeout(t);
  }
}

function extractJson(s: string): any {
  const t = s.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("AI returned invalid JSON");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider not configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const leadId: string | undefined = body?.lead_id;
  if (!leadId || typeof leadId !== "string") return json({ error: "lead_id required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Per-lead lock: refuse if a processing record exists < 5 min old.
  const { data: pending } = await supabase
    .from("ai_analyses").select("id,created_at").eq("lead_id", leadId)
    .eq("status", "processing")
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1);
  if (pending && pending.length) {
    return json({ error: "Analysis already running for this lead" }, 409);
  }

  let snapshot;
  try {
    snapshot = await buildInput(supabase, leadId);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  if (!snapshot.hasUsefulSignal) {
    return json({
      error: "Not enough buyer information is available. Add at least one meaningful interaction, note or imported conversation before running analysis.",
      code: "insufficient_data",
    }, 422);
  }

  const { data: created, error: createErr } = await supabase
    .from("ai_analyses").insert({
      lead_id: leadId,
      analysis_type: "buyer_intelligence",
      status: "processing",
      model: DEFAULT_MODEL,
      generated_by: "anonymous",
      input_snapshot: snapshot.metadata,
      source_updated_at: snapshot.leadUpdatedAt,
    }).select().single();
  if (createErr || !created) return json({ error: "Failed to start analysis" }, 500);

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(snapshot.body) },
    ];
    const raw = await callOpenRouter(messages, apiKey);
    let parsed: any;
    let validation: any;
    try {
      parsed = extractJson(raw);
      validation = validate(parsed);
    } catch (e) {
      validation = { ok: false, errors: [(e as Error).message] };
    }

    if (!validation.ok) {
      // one repair attempt
      const repair = await callOpenRouter([
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: `Your previous response failed validation: ${validation.errors.join("; ")}. Return ONLY a corrected JSON object matching the schema. No prose.` },
      ], apiKey);
      parsed = extractJson(repair);
      validation = validate(parsed);
      if (!validation.ok) throw new Error("AI output failed schema validation");
    }

    const { error: upErr } = await supabase.from("ai_analyses").update({
      status: "completed",
      output_json: parsed,
      confidence: typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : null,
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    if (upErr) throw new Error("Database save failed");

    return json({ id: created.id, status: "completed", output: parsed });
  } catch (e) {
    const msg = (e as Error).message || "Analysis failed";
    await supabase.from("ai_analyses").update({
      status: "failed",
      error_message: msg.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ id: created.id, status: "failed", error: msg }, 502);
  }
});
