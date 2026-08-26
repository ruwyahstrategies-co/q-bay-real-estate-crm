// Meta WhatsApp Cloud API webhook — shared endpoint, routed per-agent.
// Each agent's own WhatsApp Business Account is configured (on Meta's side)
// to send webhooks to this same URL; inbound messages are routed to the
// correct agent by `metadata.phone_number_id`, via whatsapp_webhook_routes.
//
// GET: Meta's subscription handshake (hub.mode/hub.verify_token/hub.challenge).
// Since each agent's connection may have its own configured verify token, we
// check the presented token against every connection's stored value.
//
// POST: inbound message. Resolves the owning agent, finds/creates the lead by
// phone number, stores the message as a CRM interaction, and links it to the
// correct agent — mirroring the old ai-receptionist lead-matching pattern but
// for real inbound WhatsApp traffic instead of a synthetic call transcript.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-12) : null;
}

async function verifyTokenMatchesAnyConnection(presented: string): Promise<boolean> {
  const { data: connections } = await supabase
    .from("agent_whatsapp_connections")
    .select("webhook_verify_token_secret_id")
    .not("webhook_verify_token_secret_id", "is", null);
  for (const c of connections ?? []) {
    const { data: stored } = await supabase.rpc("vault_read_secret", { _id: c.webhook_verify_token_secret_id });
    if (stored && stored === presented) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && (await verifyTokenMatchesAnyConnection(token))) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const entries = payload?.entry ?? [];
  let processed = 0;

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: route } = await supabase
        .from("whatsapp_webhook_routes")
        .select("team_member_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!route) continue; // not one of our configured agent numbers

      for (const msg of value?.messages ?? []) {
        const fromPhone = normalisePhone(msg?.from);
        const text: string | null = msg?.text?.body ?? msg?.button?.text ?? msg?.interactive?.button_reply?.title ?? null;
        const contactName: string | undefined = value?.contacts?.find((c: any) => c.wa_id === msg?.from)?.profile?.name;

        let leadId: string | null = null;
        if (fromPhone) {
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .ilike("phone", `%${fromPhone.slice(-8)}%`)
            .limit(1)
            .maybeSingle();
          if (existingLead) {
            leadId = existingLead.id;
          } else {
            const { data: newLead } = await supabase
              .from("leads")
              .insert({
                full_name: contactName || "WhatsApp contact",
                phone: fromPhone,
                lead_source: "whatsapp",
                pipeline_stage: "new_lead",
                assigned_agent_id: route.team_member_id,
              })
              .select("id")
              .single();
            leadId = newLead?.id ?? null;
          }
        }

        if (leadId) {
          await supabase.from("interactions").insert({
            lead_id: leadId,
            interaction_type: "whatsapp",
            direction: "inbound",
            content: text,
            interaction_date: msg?.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
            metadata: { message_id: msg?.id, phone_number_id: phoneNumberId, agent_team_member_id: route.team_member_id },
          });
          processed++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
