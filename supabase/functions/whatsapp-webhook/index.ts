// Meta WhatsApp Cloud API webhook. One shared endpoint for every connected number; the receiving number
// (metadata.phone_number_id) decides which connection owns the message.
//
// Security: a delivery is accepted only if its X-Hub-Signature-256 matches the HMAC of the exact body under the
// Meta app secret (META_APP_SECRET, an Edge Function secret). With no secret set, or while live messaging is
// switched off (WHATSAPP_LIVE_ENABLED), nothing is processed. All rules live in _shared/whatsapp-handlers.ts and
// every database write is one idempotent function, so Meta redelivering a message is harmless.
//
// This function is deployed with verify_jwt off because Meta cannot send a Supabase JWT. The signature is the gate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleWebhook } from "../_shared/whatsapp-handlers.ts";
import { timingSafeEqual } from "../_shared/whatsapp-core.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const wrap = (r: { data: any; error: { message: string } | null }) => ({
  data: r.data,
  error: r.error ? { message: r.error.message } : null,
});

Deno.serve((req) =>
  handleWebhook(req, {
    appSecret: Deno.env.get("META_APP_SECRET") || null,
    verifyToken: Deno.env.get("WHATSAPP_VERIFY_TOKEN") || null,
    liveEnabled: Deno.env.get("WHATSAPP_LIVE_ENABLED") === "true",

    // Per-connection verify tokens saved before the app-level token existed.
    matchesStoredVerifyToken: async (presented) => {
      const { data: connections } = await service
        .from("agent_whatsapp_connections")
        .select("webhook_verify_token_secret_id")
        .not("webhook_verify_token_secret_id", "is", null);
      for (const c of connections ?? []) {
        const { data: stored } = await service.rpc("vault_read_secret", { _id: c.webhook_verify_token_secret_id });
        if (typeof stored === "string" && stored && timingSafeEqual(stored, presented)) return true;
      }
      return false;
    },

    ingestInbound: async (e) =>
      wrap(
        await service.rpc("whatsapp_ingest_inbound", {
          _phone_number_id: e.phoneNumberId,
          _wa_id: e.waId,
          _contact_name: e.contactName,
          _wa_message_id: e.messageId,
          _type: e.type,
          _body: e.body,
          _wa_timestamp: e.timestamp,
          _media: e.media,
          _reply_to: e.replyTo,
        }),
      ),

    applyStatus: async (e) =>
      wrap(
        await service.rpc("whatsapp_apply_status", {
          _phone_number_id: e.phoneNumberId,
          _wa_message_id: e.messageId,
          _status: e.status,
          _ts: e.timestamp,
          _error_code: e.errorCode,
          _error_text: e.errorText,
        }),
      ),

    logEvent: async (e) => {
      await service.from("whatsapp_webhook_events").insert({
        phone_number_id: e.phone_number_id ?? null,
        event_kind: e.event_kind,
        wa_id: e.wa_id ?? null,
        wa_message_id: e.wa_message_id ?? null,
        outcome: e.outcome,
        detail: e.detail ?? null,
        payload: e.payload ?? null,
      });
    },
  }),
);
