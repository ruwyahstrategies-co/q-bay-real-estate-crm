// Development brochure (PDF) extraction via OpenRouter.
// Requires a valid Supabase Auth bearer token from an active, linked staff
// member with developments.edit AND uploads.view — see analyze-lead for the
// same auth pattern. Extraction NEVER writes directly to the developments
// row: it stores a proposed draft on the upload for staff to review and
// approve via a separate PATCH call from the CRM.

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
const SITE_URL = Deno.env.get("OPENROUTER_SITE_URL") || "https://qbayrealestate.com";
const APP_NAME = "Development Brochure Extraction";
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep base64 payload sane

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const SYSTEM_PROMPT = `You extract structured development/brochure facts from a real estate PDF for a staff review screen.

Rules:
- Use ONLY what is stated or clearly shown in the document. Never invent prices, unit counts, amenities or dates.
- If a field is not present in the document, return null (numbers/strings) or an empty array — never guess.
- amenities and property_types must be short, deduplicated labels (e.g. "Swimming Pool", "Apartment").
- unit_mix is an array of { type, beds, size_from_sqm, size_to_sqm, price_from, price_to } for each distinct unit type described.
- highlights are the 3-8 strongest marketing-relevant facts (not hype adjectives) worth surfacing to a buyer.
- Return STRICTLY a single JSON object matching the schema. No markdown, no prose, no code fences.`;

const USER_PROMPT = `Read the attached development brochure and return a JSON object exactly matching this schema:
{
  "description": string,
  "highlights": [string],
  "amenities": [string],
  "property_types": [string],
  "unit_mix": [{"type": string, "beds": number|null, "size_from_sqm": number|null, "size_to_sqm": number|null, "price_from": number|null, "price_to": number|null}],
  "price_from": number|null,
  "price_to": number|null,
  "currency": string|null,
  "completion_status": string|null,
  "delivery_timeline": string|null
}`;

function validate(o: any): { ok: true } | { ok: false; errors: string[] } {
  const errs: string[] = [];
  if (!o || typeof o !== "object") return { ok: false, errors: ["root must be object"] };
  if (typeof o.description !== "string") errs.push("description must be a string");
  if (!Array.isArray(o.highlights)) errs.push("highlights must be an array");
  if (!Array.isArray(o.amenities)) errs.push("amenities must be an array");
  if (!Array.isArray(o.property_types)) errs.push("property_types must be an array");
  if (!Array.isArray(o.unit_mix)) errs.push("unit_mix must be an array");
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

function extractJson(s: string): any {
  const t = s.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  throw new Error("AI returned invalid JSON");
}

async function callOpenRouter(fileDataUrl: string, filename: string, apiKey: string) {
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
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        // Ask OpenRouter's file-parser plugin to pull text out of the PDF as
        // a fallback for models without native PDF support.
        plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }],
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              { type: "file", file: { filename, file_data: fileDataUrl } },
            ],
          },
        ],
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!await checkRateLimit(req, supabase, "extract-brochure", 4)) return tooManyRequests(CORS);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider not configured" }, 500);

  const auth = await authorizeCaller(req, supabase, [
    { module: "developments", action: "edit" },
    { module: "uploads", action: "view" },
  ]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const developmentId: string | undefined = body?.development_id;
  if (!developmentId) return json({ error: "development_id required" }, 400);

  const { data: development, error: devErr } = await supabase
    .from("developments").select("id, brochure_upload_id").eq("id", developmentId).maybeSingle();
  if (devErr) return json({ error: "Development lookup failed" }, 500);
  if (!development) return json({ error: "Development not found" }, 404);
  if (!development.brochure_upload_id) return json({ error: "This development has no brochure uploaded yet" }, 422);

  const { data: upload, error: upErr } = await supabase
    .from("uploads").select("id, filename, storage_bucket, storage_path, mime_type, file_size, processing_status")
    .eq("id", development.brochure_upload_id).maybeSingle();
  if (upErr) return json({ error: "Upload lookup failed" }, 500);
  if (!upload) return json({ error: "Brochure upload not found" }, 404);
  if (upload.mime_type && upload.mime_type !== "application/pdf") {
    return json({ error: "Only PDF brochures can be extracted automatically right now" }, 422);
  }
  if (upload.file_size && upload.file_size > MAX_FILE_BYTES) {
    return json({ error: "Brochure is too large to extract automatically (20MB limit)" }, 422);
  }

  await supabase.from("uploads").update({ processing_status: "processing", processing_error: null }).eq("id", upload.id);

  try {
    const { data: fileBlob, error: dlErr } = await supabase.storage.from(upload.storage_bucket).download(upload.storage_path);
    if (dlErr || !fileBlob) throw new Error("Could not download brochure from storage");

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const base64 = btoa(binary);
    const fileDataUrl = `data:application/pdf;base64,${base64}`;

    const raw = await callOpenRouter(fileDataUrl, upload.filename, apiKey);
    let parsed: any, validation: any;
    try { parsed = extractJson(raw); validation = validate(parsed); }
    catch (e) { validation = { ok: false, errors: [(e as Error).message] }; }
    if (!validation.ok) throw new Error(`AI output failed schema validation: ${validation.errors.join("; ")}`);

    await supabase.from("uploads").update({
      processing_status: "extracted",
      processing_error: null,
      metadata: { extraction: parsed, extracted_at: new Date().toISOString(), extracted_by: auth.email ?? auth.userId },
      updated_at: new Date().toISOString(),
    }).eq("id", upload.id);

    return json({ ok: true, upload_id: upload.id, extraction: parsed });
  } catch (e) {
    const msg = (e as Error).message || "Extraction failed";
    await supabase.from("uploads").update({ processing_status: "failed", processing_error: msg.slice(0, 500) }).eq("id", upload.id);
    return json({ ok: false, error: msg }, 502);
  }
});
