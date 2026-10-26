// Sends a WhatsApp message to a LEAD. The recipient's number is read from the lead on the server, never taken
// from the browser, and the caller must be allowed to message that lead (checked in the database as the caller,
// so it is the same rule that guards the lead itself).
//
// Meta's rules are enforced in the database: free text only inside the 24 hour customer service window, an
// approved template otherwise, never to someone who opted out, and a repeated client_request_id never sends twice.
// Nothing is sent until WHATSAPP_LIVE_ENABLED is "true". The access token is read from the vault on the server and
// is never returned.
//
// Request: { lead_id, client_request_id?, opt_in_confirmed?, and exactly one of
//            message | template: { name, language, params[] } | media: { kind, url, caption?, filename? } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callerScopedClient } from "../_shared/auth.ts";
import { authorizeCaller } from "../_shared/user-auth.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { handleSend, type WhatsappConnection, type WhatsappMode } from "../_shared/whatsapp-handlers.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CONNECTION_COLUMNS = "id, phone_number_id, waba_id, connection_status, access_token_secret_id, scope";

const wrap = (r: { data: any; error: { message: string } | null }) => ({
  data: r.data,
  error: r.error ? { message: r.error.message } : null,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const res = await handleSend(req, {
    liveEnabled: Deno.env.get("WHATSAPP_LIVE_ENABLED") === "true",
    defaultCountryCode: Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE") || "974",
    graphVersion: Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v21.0",
    fetch,
    rateLimitOk: (r) => checkRateLimit(r, "whatsapp-send", 30),

    authenticate: async (r) => {
      const auth = await authorizeCaller(r, service, [{ module: "conversations", action: "create" }]);
      return auth.ok ? { ok: true, userId: auth.userId, teamMemberId: auth.teamMember.id } : auth;
    },

    canSendLead: async (r, leadId) => {
      const { data, error } = await callerScopedClient(r).rpc("whatsapp_can_send_lead", { _lead_id: leadId });
      return !error && data === true;
    },

    getLead: async (leadId) => {
      const { data } = await service.from("leads").select("id, phone").eq("id", leadId).maybeSingle();
      return data ?? null;
    },

    getMode: async (): Promise<WhatsappMode> => {
      const { data } = await service.from("app_settings").select("setting_value").eq("setting_key", "whatsapp_mode").maybeSingle();
      const mode = (data?.setting_value as { mode?: string } | null)?.mode;
      return mode === "shared" || mode === "individual" ? mode : "undecided";
    },

    getConnections: async (teamMemberId) => {
      const [own, company] = await Promise.all([
        service.from("agent_whatsapp_connections").select(CONNECTION_COLUMNS).eq("team_member_id", teamMemberId).eq("scope", "agent").maybeSingle(),
        service.from("agent_whatsapp_connections").select(CONNECTION_COLUMNS).eq("scope", "company").limit(1).maybeSingle(),
      ]);
      return { own: (own.data as WhatsappConnection | null) ?? null, company: (company.data as WhatsappConnection | null) ?? null };
    },

    getTemplate: async (wabaId, name, language) => {
      const { data } = await service
        .from("whatsapp_templates")
        .select("name, language, status, param_count, category")
        .eq("waba_id", wabaId)
        .eq("name", name)
        .eq("language", language)
        .maybeSingle();
      return data ?? null;
    },

    readToken: async (secretId) => {
      const { data } = await service.rpc("vault_read_secret", { _id: secretId });
      return typeof data === "string" && data ? data : null;
    },

    beginOutbound: async (a) =>
      wrap(
        await service.rpc("whatsapp_begin_outbound", {
          _connection_id: a.connectionId,
          _lead_id: a.leadId,
          _wa_id: a.waId,
          _client_request_id: a.clientRequestId,
          _type: a.type,
          _body: a.body,
          _template_name: a.templateName,
          _template_language: a.templateLanguage,
          _template_params: a.templateParams,
          _sent_by: a.sentBy,
          _opt_in_confirmed: a.optInConfirmed,
        }),
      ),

    finishOutbound: async (a) =>
      wrap(
        await service.rpc("whatsapp_finish_outbound", {
          _message_id: a.messageId,
          _wa_message_id: a.waMessageId,
          _error_code: a.errorCode,
          _error_text: a.errorText,
          _sent_by_user: a.sentByUser,
        }),
      ),
  });

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
