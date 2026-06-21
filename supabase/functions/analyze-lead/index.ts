// Lead Sales Intelligence via OpenRouter.
// verify_jwt = false (see supabase/config.toml). Anonymous CRUD model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.6";
const SITE_URL = Deno.env.get("OPENROUTER_SITE_URL") || "https://lovable.app";
const APP_NAME = "Real Estate Sales Intelligence";
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

const STAGES = [
  "new_lead","contacted","qualified","property_matching",
  "viewing_scheduled","negotiation","documentation","won","lost",
];

function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function buildInput(supabase: any, leadId: string) {
  const { data: lead, error: leadErr } = await supabase
    .from("leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) throw new Error("lead fetch failed");
  if (!lead) throw new Error("lead not found");

  const [{ data: interactions = [] }, { data: uploads = [] }, { data: interests = [] }, { data: activeProps = [] }] = await Promise.all([
    supabase.from("interactions").select("id, interaction_type, direction, content, subject, interaction_date").eq("lead_id", leadId).order("interaction_date", { ascending: false }).limit(40),
    supabase.from("uploads").select("id, filename, category, processing_status, extracted_text").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20),
    supabase.from("lead_property_interests").select("id, interest_level, notes, properties(id, title, reference_code, location, property_type, price, currency, bedrooms, availability, amenities, completion_status)").eq("lead_id", leadId),
    supabase.from("properties").select("id, title, reference_code, location, property_type, price, currency, bedrooms, bathrooms, size, availability, amenities, completion_status, developer").eq("status","active").limit(120),
  ]);

  const profile = {
    full_name: lead.full_name, nationality: lead.nationality,
    preferred_language: lead.preferred_language, lead_source: lead.lead_source,
    pipeline_stage: lead.pipeline_stage,
    budget_min: lead.budget_min, budget_max: lead.budget_max, currency: lead.currency,
    preferred_locations: lead.preferred_locations,
    preferred_property_types: lead.preferred_property_types,
    bedrooms: lead.bedrooms, purchase_purpose: lead.purchase_purpose,
    buying_timeline: lead.buying_timeline, financing_status: lead.financing_status,
    notes: clip(lead.notes, 3000),
  };

  const intArr = (interactions as any[]).map((i) => ({
    ref: `interaction:${i.id}`, type: i.interaction_type, direction: i.direction,
    date: i.interaction_date, subject: i.subject, content: clip(i.content, 2500),
  }));

  const upArr: any[] = [];
  for (const u of uploads as any[]) {
    if (u.processing_status === "completed" && u.extracted_text) {
      upArr.push({ ref: `upload:${u.id}`, filename: u.filename, category: u.category, text: clip(u.extracted_text, 5000) });
    }
  }

  const intsArr = (interests as any[]).map((it) => ({
    ref: `property_interest:${it.id}`, status: it.interest_level,
    notes: clip(it.notes, 400),
    property: it.properties ? {
      id: it.properties.id, code: it.properties.reference_code, title: it.properties.title,
      location: it.properties.location, type: it.properties.property_type,
      price: it.properties.price, currency: it.properties.currency, bedrooms: it.properties.bedrooms,
    } : null,
  }));

  const inventory = (activeProps as any[]).map((p) => ({
    id: p.id, code: p.reference_code, title: p.title, location: p.location,
    type: p.property_type, price: p.price, currency: p.currency,
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, size: p.size,
    availability: p.availability, amenities: p.amenities,
    completion_status: p.completion_status, developer: p.developer,
  }));

  let body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, activeInventory: inventory });
  while (body.length > MAX_INPUT_CHARS && intArr.length > 5) {
    intArr.pop();
    body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, activeInventory: inventory });
  }
  while (body.length > MAX_INPUT_CHARS && inventory.length > 20) {
    inventory.pop();
    body = JSON.stringify({ profile, interactions: intArr, uploads: upArr, propertyInterests: intsArr, activeInventory: inventory });
  }

  const hasSignal = !!lead.notes || intArr.length > 0 || upArr.length > 0 || intsArr.length > 0
    || !!lead.budget_max || (lead.preferred_locations?.length ?? 0) > 0;

  return { body, hasSignal, leadUpdatedAt: lead.updated_at, meta: { interactions: intArr.length, uploads: upArr.length, interests: intsArr.length, inventory: inventory.length } };
}

const SYSTEM_PROMPT = `You are a real estate sales coach. From the supplied buyer data, produce concise, operational sales guidance.

Rules:
- Use ONLY the supplied information. Do not invent facts, budgets, preferences or quotes. If unknown, leave the field empty and add it to wants.missing_info.
- Reference evidence via the "ref" strings in the input (e.g. "interaction:abc", "upload:abc", "property_interest:abc", "lead_profile", "lead_notes").
- For property_matches, ONLY pick properties from activeInventory and return their real id.
- Forbidden: manipulative or pressuring tactics, false urgency, scarcity fabrication, discriminatory signals (religion, race, ethnicity, health, political beliefs, gender, family status, nationality used as a buying signal).
- The purpose of pain_points is to resolve genuine concerns, not to overcome them with pressure.
- Keep drafts short and professional. WhatsApp: 1-3 sentences. Email: 4-7 sentences. Objection response: 2-4 sentences.
- Return STRICTLY a single JSON object that matches the schema. No markdown, no prose, no code fences.`;

function buildUserPrompt(snapshot: string) {
  return `Buyer data (JSON):
${snapshot}

Return a JSON object exactly matching this schema (use empty arrays/null where unknown):
{
  "buyer_summary": {
    "buyer_type": string,
    "budget": string,
    "preferred_locations": [string],
    "property_type": string,
    "timeline": string,
    "financing": string,
    "pipeline_stage": one of ${STAGES.join("|")},
    "main_motivation": string
  },
  "wants": {
    "explicit_requirements": [string],
    "must_haves": [string],
    "preferences": [string],
    "mentioned_properties": [{"property_id": string|null, "label": string, "status": "viewed"|"mentioned"|"shortlisted"|"rejected"}],
    "rejected": [string],
    "missing_info": [string]
  },
  "sales_playbook": {
    "next_action": string,
    "call_strategy": string,
    "questions": [string],
    "whatsapp_draft": string,
    "email_draft": string,
    "objection_response": string
  },
  "pain_points": [{
    "concern": string,
    "evidence": [string],
    "how_to_address": string,
    "what_to_avoid": string
  }],
  "property_matches": [{
    "property_id": string,
    "match_percent": 0-100,
    "reasons": [string],
    "conflicts": [string],
    "price": string,
    "availability": string
  }],
  "deep_analysis": {
    "motivations": [{"label": string, "explanation": string, "evidence": [string]}],
    "risks": [{"label": string, "explanation": string, "evidence": [string]}],
    "urgency": string,
    "confidence": 0-100,
    "intent_score": 0-100,
    "buyer_status": "cold"|"warm"|"hot"|"at_risk"|"unclear",
    "summary": string
  }
}

Constraints:
- questions array: 1-3 items, the most useful next questions to ask.
- pain_points: at most 5, only those with real evidence in the data.
- property_matches: at most 3, pick highest-fit from activeInventory only. Each property_id MUST be one of the ids in activeInventory.
- mentioned_properties property_id MUST come from propertyInterests, activeInventory, or be null when only a name is mentioned.`;
}

function validate(o: any): { ok: true } | { ok: false; errors: string[] } {
  const errs: string[] = [];
  if (!o || typeof o !== "object") return { ok: false, errors: ["root must be object"] };
  if (!o.buyer_summary || typeof o.buyer_summary !== "object") errs.push("buyer_summary missing");
  if (o.buyer_summary && !STAGES.includes(o.buyer_summary.pipeline_stage)) errs.push("buyer_summary.pipeline_stage invalid");
  if (!o.wants || typeof o.wants !== "object") errs.push("wants missing");
  if (!o.sales_playbook || typeof o.sales_playbook !== "object") errs.push("sales_playbook missing");
  if (o.sales_playbook && !Array.isArray(o.sales_playbook.questions)) errs.push("sales_playbook.questions must be array");
  if (!Array.isArray(o.pain_points)) errs.push("pain_points must be array");
  if (!Array.isArray(o.property_matches)) errs.push("property_matches must be array");
  if (!o.deep_analysis || typeof o.deep_analysis !== "object") errs.push("deep_analysis missing");
  return errs.length ? { ok: false, errors: errs } : { ok: true };
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
        model: MODEL, temperature: 0.3, max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" }, messages,
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("OpenRouter error", res.status, text.slice(0, 400));
      const safe = res.status === 401 ? "AI provider authentication failed"
        : res.status === 402 ? "AI provider credits exhausted"
        : res.status === 429 ? "AI provider rate limit reached"
        : res.status >= 500 ? "AI provider temporarily unavailable"
        : "AI provider request failed";
      throw new Error(safe);
    }
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("Empty AI response");
    return content;
  } finally { clearTimeout(t); }
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

  if (!await checkRateLimit(req, "analyze-lead", 6)) return tooManyRequests(CORS);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider not configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const leadId: string | undefined = body?.lead_id;
  if (!leadId) return json({ error: "lead_id required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: pending } = await supabase
    .from("ai_analyses").select("id,created_at").eq("lead_id", leadId)
    .eq("status", "processing").gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).limit(1);
  if (pending && pending.length) return json({ error: "Analysis already running for this lead" }, 409);

  let snapshot;
  try { snapshot = await buildInput(supabase, leadId); }
  catch (e) { return json({ error: (e as Error).message }, 400); }

  if (!snapshot.hasSignal) {
    return json({
      error: "Not enough buyer information. Add at least one meaningful interaction, note or imported conversation before running analysis.",
      code: "insufficient_data",
    }, 422);
  }

  // Source signature: stable fingerprint of inputs used for this run
  const sigSource = JSON.stringify({ meta: snapshot.meta, leadUpdatedAt: snapshot.leadUpdatedAt });
  const sigBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sigSource));
  const sourceSignature = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

  // Mark previous completed analyses for this lead as superseded
  await supabase.from("ai_analyses").update({
    is_outdated: true,
    outdated_reason: "superseded",
  }).eq("lead_id", leadId).eq("status", "completed").eq("is_outdated", false);

  const { data: created, error: createErr } = await supabase.from("ai_analyses").insert({
    lead_id: leadId, analysis_type: "sales_intelligence", status: "processing",
    model: MODEL, generated_by: "anonymous", input_snapshot: snapshot.meta,
    source_updated_at: snapshot.leadUpdatedAt, source_signature: sourceSignature,
    is_outdated: false,
  }).select().single();
  if (createErr || !created) return json({ error: "Failed to start analysis" }, 500);

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(snapshot.body) },
    ];
    const raw = await callOpenRouter(messages, apiKey);
    let parsed: any, validation: any;
    try { parsed = extractJson(raw); validation = validate(parsed); }
    catch (e) { validation = { ok: false, errors: [(e as Error).message] }; }

    if (!validation.ok) {
      const repair = await callOpenRouter([
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: `Your previous response failed validation: ${validation.errors.join("; ")}. Return ONLY a corrected JSON object matching the schema. No prose.` },
      ], apiKey);
      parsed = extractJson(repair); validation = validate(parsed);
      if (!validation.ok) throw new Error("AI output failed schema validation");
    }

    const conf = typeof parsed?.deep_analysis?.confidence === "number" ? parsed.deep_analysis.confidence : null;
    const { error: upErr } = await supabase.from("ai_analyses").update({
      status: "completed", output_json: parsed, confidence: conf,
      is_outdated: false, outdated_reason: null,
      updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    if (upErr) throw new Error("Database save failed");

    return json({ id: created.id, status: "completed", output: parsed });
  } catch (e) {
    const msg = (e as Error).message || "Analysis failed";
    await supabase.from("ai_analyses").update({
      status: "failed", error_message: msg.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq("id", created.id);
    return json({ id: created.id, status: "failed", error: msg }, 502);
  }
});
