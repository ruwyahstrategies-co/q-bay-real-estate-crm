// Returns non-secret connection status for the AI Receptionist dashboard.
// Never returns raw secret values — only presence flags and masked identifiers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizeCaller } from "../_shared/user-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function mask(value: string | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return "•".repeat(value.length);
  return "•".repeat(Math.max(4, value.length - keep)) + value.slice(-keep);
}

function maskPhone(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return value.slice(0, value.length - digits.length + 1) + "•••" + value.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAuthCheck = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const auth = await authorizeCaller(req, supabaseAuthCheck, [{ module: "ai_receptionist", action: "view" }]);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
  const webhookSecret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
  const transferNumber = Deno.env.get("RECEPTIONIST_TRANSFER_NUMBER");

  // Last successful webhook delivery
  let lastWebhookAt: string | null = null;
  try {
    const supabase = supabaseAuthCheck;
    const { data } = await supabase
      .from("receptionist_calls")
      .select("created_at")
      .not("raw_webhook", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastWebhookAt = data?.created_at ?? null;
  } catch (_) { /* ignore */ }

  const mode =
    elevenKey && agentId && twilioPhone ? "live"
    : elevenKey || agentId || twilioPhone ? "partial"
    : "not_configured";

  const body = {
    mode,
    elevenlabs: {
      api_key_present: !!elevenKey,
      agent_id_present: !!agentId,
      agent_id_masked: mask(agentId),
      webhook_secret_present: !!webhookSecret,
    },
    twilio: {
      account_sid_present: !!twilioSid,
      account_sid_masked: mask(twilioSid, 4),
      auth_token_present: !!twilioToken,
      phone_number_present: !!twilioPhone,
      phone_number_masked: maskPhone(twilioPhone),
    },
    transfer: {
      number_present: !!transferNumber,
      number_masked: maskPhone(transferNumber),
    },
    last_webhook_at: lastWebhookAt,
    inbound_ready: !!(elevenKey && agentId && twilioPhone),
    transfer_ready: !!transferNumber,
  };

  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
