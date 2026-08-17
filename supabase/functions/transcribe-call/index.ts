// Call-recording intelligence loop.
// 1. Fetch the audio upload from storage
// 2. Transcribe via Lovable AI Gateway STT
// 3. Use OpenRouter to extract requirements / objections / property mentions / next actions
// 4. Save an interaction row (transcript preserved as evidence, structured info in metadata)
// 5. Mark uploads.processing_status='completed' + extracted_text=transcript
// Anonymous CRUD (verify_jwt = false). Old analyses are auto-marked outdated by DB triggers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { authorizeCaller } from "../_shared/user-auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.6";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // gateway 25 MiB cap

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

function clip(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function transcribeAudio(blob: Blob, filename: string): Promise<string> {
  if (!LOVABLE_KEY) throw new Error("Transcription provider not configured");
  const fd = new FormData();
  fd.append("model", STT_MODEL);
  fd.append("file", blob, filename);
  // non-streaming buffered response so we get a clean { text } result
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}` },
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("STT error", res.status, txt.slice(0, 300));
    if (res.status === 402) throw new Error("Transcription credits exhausted");
    if (res.status === 429) throw new Error("Transcription rate limit reached");
    if (res.status === 400) throw new Error("Audio file could not be transcribed (unsupported format or empty)");
    throw new Error("Transcription failed");
  }
  const data = await res.json();
  const text = data?.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Transcription returned empty text");
  }
  return text.trim();
}

type Extraction = {
  summary: string;
  requirements: string[];
  objections: string[];
  property_mentions: { id: string | null; label: string }[];
  next_actions: string[];
  buyer_sentiment: "positive" | "neutral" | "concerned" | "negative" | "unclear";
};

async function extractFromTranscript(
  transcript: string,
  inventory: { id: string; code: string | null; title: string; location: string | null }[],
  lead: { full_name: string; preferred_locations: string[] | null },
): Promise<Extraction> {
  if (!OPENROUTER_KEY) throw new Error("AI provider not configured");
  const sys = `You extract structured sales information from a call transcript. Use ONLY what is in the transcript. Do not invent facts. Return STRICT JSON only.`;
  const user = `Lead: ${lead.full_name}
Known preferred locations: ${(lead.preferred_locations ?? []).join(", ") || "unknown"}

Active inventory (id, code, title, location):
${inventory.slice(0, 80).map((p) => `- ${p.id} | ${p.code ?? "-"} | ${p.title} | ${p.location ?? "-"}`).join("\n")}

Transcript:
"""
${clip(transcript, 18000)}
"""

Return JSON exactly matching:
{
  "summary": string (3-5 sentences),
  "requirements": [string] (concrete buyer requirements explicitly mentioned),
  "objections": [string] (concerns or objections actually raised),
  "property_mentions": [{"id": string|null, "label": string}] (id MUST be one of the inventory ids when the property is the same; otherwise null),
  "next_actions": [string] (specific follow-ups agreed or implied),
  "buyer_sentiment": "positive"|"neutral"|"concerned"|"negative"|"unclear"
}
No markdown, no prose, no code fences.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lovable.app",
      "X-Title": "Real Estate Sales Intelligence",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("OpenRouter extraction error", res.status, t.slice(0, 300));
    throw new Error("AI extraction failed");
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty extraction");
  let parsed: any;
  try { parsed = JSON.parse(content); }
  catch {
    const m = content.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  }
  if (!parsed) throw new Error("AI returned invalid JSON");
  return {
    summary: String(parsed.summary ?? ""),
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements.map(String) : [],
    objections: Array.isArray(parsed.objections) ? parsed.objections.map(String) : [],
    property_mentions: Array.isArray(parsed.property_mentions) ? parsed.property_mentions.map((m: any) => ({
      id: typeof m?.id === "string" ? m.id : null,
      label: String(m?.label ?? ""),
    })) : [],
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions.map(String) : [],
    buyer_sentiment: ["positive", "neutral", "concerned", "negative", "unclear"].includes(parsed.buyer_sentiment)
      ? parsed.buyer_sentiment : "unclear",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!await checkRateLimit(req, "transcribe-call", 6)) return tooManyRequests(CORS);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const auth = await authorizeCaller(req, supabase, [{ module: "conversations", action: "create" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const uploadId: string | undefined = body?.upload_id;
  const leadId: string | undefined = body?.lead_id || undefined;
  const direction: string = body?.direction || "inbound";
  if (!uploadId) return json({ error: "upload_id required" }, 400);

  // 1. fetch upload
  const { data: upload, error: upErr } = await supabase
    .from("uploads").select("*").eq("id", uploadId).maybeSingle();
  if (upErr || !upload) return json({ error: "Upload not found" }, 404);
  if (upload.storage_bucket !== "call-recordings") return json({ error: "Upload is not a call recording" }, 400);
  if ((upload.file_size ?? 0) > MAX_AUDIO_BYTES) return json({ error: "Audio file too large (max 25 MiB)" }, 413);

  const effectiveLeadId = leadId ?? upload.lead_id ?? null;
  if (!effectiveLeadId) return json({ error: "lead_id required (upload is not linked to a lead)" }, 400);

  // mark processing
  await supabase.from("uploads").update({ processing_status: "processing", processing_error: null }).eq("id", uploadId);

  try {
    // 2. download audio
    const { data: file, error: dlErr } = await supabase.storage.from(upload.storage_bucket).download(upload.storage_path);
    if (dlErr || !file) throw new Error("Could not read audio from storage");

    // 3. transcribe
    const transcript = await transcribeAudio(file, upload.filename || "recording.webm");

    // 4. fetch lead + small inventory for extraction
    const { data: lead } = await supabase.from("leads").select("full_name, preferred_locations").eq("id", effectiveLeadId).maybeSingle();
    const { data: inventory = [] } = await supabase.from("properties").select("id, reference_code, title, location").eq("status", "active").limit(120);

    let extraction: Extraction | null = null;
    try {
      extraction = await extractFromTranscript(
        transcript,
        (inventory as any[]).map((p) => ({ id: p.id, code: p.reference_code, title: p.title, location: p.location })),
        { full_name: lead?.full_name ?? "Unknown", preferred_locations: lead?.preferred_locations ?? null },
      );
    } catch (e) {
      console.warn("extraction failed, saving transcript without extraction:", (e as Error).message);
    }

    // 5. insert interaction with transcript + metadata
    const subject = extraction?.summary
      ? `Call: ${clip(extraction.summary, 100)}`
      : `Call recording: ${upload.filename}`;
    const { data: interaction, error: intErr } = await supabase.from("interactions").insert({
      lead_id: effectiveLeadId,
      interaction_type: "phone_call",
      direction,
      subject,
      content: extraction?.summary ?? clip(transcript, 1500),
      interaction_date: upload.created_at,
      transcript,
      upload_id: uploadId,
      metadata: extraction ? {
        extraction,
        source: "transcribe-call",
        extracted_at: new Date().toISOString(),
      } : { source: "transcribe-call", extraction_error: true },
      ai_processed_at: new Date().toISOString(),
      duration_seconds: (upload.metadata as any)?.duration_seconds ?? null,
    }).select().single();
    if (intErr || !interaction) throw new Error("Failed to save interaction");

    // 6. write back property events for each identified property mention
    if (extraction?.property_mentions?.length) {
      const events = extraction.property_mentions
        .filter((m) => m.id)
        .map((m) => ({
          property_id: m.id!,
          lead_id: effectiveLeadId,
          event_type: "mention",
          source: "call_transcript",
          source_ref: interaction.id,
          weight: 2,
          metadata: { label: m.label },
        }));
      if (events.length) {
        await supabase.from("property_events").insert(events);
      }
    }

    // 7. close upload
    await supabase.from("uploads").update({
      processing_status: "completed",
      processing_error: null,
      extracted_text: transcript,
      metadata: { ...(upload.metadata as any || {}), interaction_id: interaction.id, transcribed_at: new Date().toISOString() },
    }).eq("id", uploadId);

    return json({
      ok: true,
      interaction_id: interaction.id,
      transcript_length: transcript.length,
      extraction,
    });
  } catch (e) {
    const msg = (e as Error).message || "Transcription failed";
    await supabase.from("uploads").update({
      processing_status: "failed",
      processing_error: msg.slice(0, 500),
    }).eq("id", uploadId);
    return json({ error: msg }, 500);
  }
});
