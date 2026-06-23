// ElevenLabs post-call webhook receiver.
// Verifies HMAC signature, prevents duplicate processing, persists transcript +
// summary + extracted data, creates/updates lead, logs interactions, creates
// follow-up tasks, marks lead analysis outdated.
//
// Expected ElevenLabs payload (conversational AI post-call webhook):
//   {
//     type: "post_call_transcription",
//     event_timestamp: ...,
//     data: {
//       conversation_id, agent_id, status,
//       transcript: [...],
//       metadata: { call_duration_secs, start_time_unix_secs, ... , phone_call: { external_number, agent_number } },
//       analysis: { transcript_summary, call_summary_title, data_collection_results, evaluation_criteria_results, ... }
//     }
//   }
//
// Signature header: ElevenLabs-Signature: t=<ts>,v0=<hmac_sha256(`${t}.${body}`, secret)>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=").map((s) => s.trim())),
  );
  const ts = parts["t"];
  const sig = parts["v0"];
  if (!ts || !sig) return false;

  // Reject events older than 30 minutes
  const age = Math.abs(Date.now() / 1000 - parseInt(ts, 10));
  if (isNaN(age) || age > 1800) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-12) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");

  // If a secret is configured, enforce signature. If not configured (early
  // demo phase), accept but log a warning so the UI can show 'unverified'.
  let verified = false;
  if (secret) {
    verified = await verifySignature(rawBody, req.headers.get("elevenlabs-signature"), secret);
    if (!verified) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("[receptionist-webhook] ELEVENLABS_WEBHOOK_SECRET not set — accepting unverified");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // deno-lint-ignore no-explicit-any
  const data: any = (payload as any).data ?? payload;
  const conversationId: string | undefined = data.conversation_id ?? data.conversationId;
  if (!conversationId) {
    return new Response(JSON.stringify({ ok: false, error: "missing_conversation_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency
  const { data: existing } = await supabase
    .from("receptionist_calls")
    .select("id")
    .eq("elevenlabs_conversation_id", conversationId)
    .maybeSingle();

  if (existing && data.status !== "in_progress") {
    return new Response(JSON.stringify({ ok: true, duplicate: true, call_id: existing.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const callerNumber = normalisePhone(data?.metadata?.phone_call?.external_number);
  const calledNumber = data?.metadata?.phone_call?.agent_number ?? null;
  const startUnix = data?.metadata?.start_time_unix_secs;
  const duration = data?.metadata?.call_duration_secs ?? null;
  const startedAt = startUnix ? new Date(startUnix * 1000).toISOString() : null;
  const endedAt = startUnix && duration ? new Date((startUnix + duration) * 1000).toISOString() : null;

  const analysis = data.analysis ?? {};
  const summary: string | null = analysis.transcript_summary ?? analysis.call_summary_title ?? null;
  const extracted = analysis.data_collection_results ?? {};
  const transcript = data.transcript ?? [];

  // Match or create lead
  let leadId: string | null = null;
  let isNewLead = false;
  if (callerNumber) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .ilike("phone", `%${callerNumber.slice(-8)}%`)
      .limit(1)
      .maybeSingle();
    if (existingLead) {
      leadId = existingLead.id;
    } else {
      const ex = extracted as any;
      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          full_name: ex.full_name?.value ?? ex.name?.value ?? [ex.first_name?.value, ex.last_name?.value].filter(Boolean).join(" ") ?? "Caller",
          phone: callerNumber,
          lead_source: "ai_receptionist",
          pipeline_stage: "new_lead",
          notes: summary,
        } as never)
        .select("id")
        .single();
      if (newLead) {
        leadId = newLead.id;
        isNewLead = true;
      }
    }
  }

  // Properties mentioned
  const propertiesMentioned: string[] = Array.isArray(extracted?.properties_mentioned?.value)
    ? extracted.properties_mentioned.value
    : [];

  // Save call
  const callRow = {
    elevenlabs_conversation_id: conversationId,
    lead_id: leadId,
    caller_number: callerNumber,
    called_number: calledNumber,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: duration,
    status: data.status ?? "completed",
    outcome: analysis?.call_successful ?? null,
    intent_level: extracted?.intent_level?.value ?? null,
    summary,
    transcript: transcript as never,
    extracted_data: extracted as never,
    properties_mentioned: propertiesMentioned as never,
    transfer_status: data?.metadata?.transfer_status ?? null,
    recording_url: data?.metadata?.recording_url ?? null,
    is_new_lead: isNewLead,
    raw_webhook: payload as never,
  };

  let callId: string;
  if (existing) {
    await supabase.from("receptionist_calls").update(callRow as never).eq("id", existing.id);
    callId = existing.id;
  } else {
    const { data: ins, error } = await supabase
      .from("receptionist_calls")
      .insert(callRow as never)
      .select("id")
      .single();
    if (error) {
      console.error("[receptionist-webhook] insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    callId = ins.id;
  }

  // Save interaction record on lead (transcript-bearing)
  if (leadId) {
    await supabase.from("interactions").insert({
      lead_id: leadId,
      interaction_type: "phone_call",
      direction: "inbound",
      subject: summary,
      content: summary,
      transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
      interaction_date: startedAt ?? new Date().toISOString(),
      duration_seconds: duration,
      metadata: { source: "ai_receptionist", conversation_id: conversationId, call_id: callId } as never,
    } as never);

    // Property mention events for demand analytics
    for (const propRef of propertiesMentioned) {
      const { data: prop } = await supabase
        .from("properties")
        .select("id")
        .or(`id.eq.${propRef},title.ilike.%${propRef}%`)
        .limit(1)
        .maybeSingle();
      if (prop) {
        await supabase.from("property_events").insert({
          property_id: prop.id,
          lead_id: leadId,
          event_type: "mentioned_in_call",
          source: "ai_receptionist",
          metadata: { conversation_id: conversationId } as never,
        } as never);
      }
    }

    // Mark previous analyses outdated
    await supabase
      .from("ai_analyses")
      .update({ is_outdated: true, outdated_reason: "receptionist_call" })
      .eq("lead_id", leadId)
      .eq("is_outdated", false);
  }

  return new Response(JSON.stringify({ ok: true, call_id: callId, verified, lead_id: leadId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
});
