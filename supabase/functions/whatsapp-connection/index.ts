// WhatsApp Business (Meta Cloud API) connection management.
//
// A connection has a scope: 'agent' (one staff member's own number) or 'company' (one shared number, set up by a
// manager). Which model the company uses is the whatsapp_mode setting ('shared', 'individual', or 'undecided'
// until the client confirms), so either can be switched on without a rebuild. Access tokens (and an optional
// webhook verify token) live in Supabase Vault; the table only holds a reference id, and no response here ever
// contains a secret.
//
// Actions: save (default), disconnect, status (is live messaging on, is the webhook configured, which model),
// set_mode (managers only).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, isAdminTeamMember, type TeamMemberRow } from "../_shared/auth.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SAFE_COLUMNS =
  "id, team_member_id, scope, phone_number_id, waba_id, display_phone_number, connection_status, last_verified_at, last_error, created_at, updated_at";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function canManage(tm: TeamMemberRow) {
  return isAdminTeamMember(tm) || tm.role === "super_administrator";
}

type Body = {
  action?: "save" | "disconnect" | "status" | "set_mode";
  scope?: "agent" | "company";
  mode?: "shared" | "individual" | "undecided";
  phone_number_id?: string;
  waba_id?: string;
  display_phone_number?: string;
  access_token?: string;
  webhook_verify_token?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await checkRateLimit(req, "whatsapp-connection", 20))) return tooManyRequests(CORS);
  const auth = await resolveActiveCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const teamMemberId = auth.teamMember.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // ---- status: what the screen needs to explain the current state. No secret values, only whether they exist.
  if (body.action === "status") {
    const { data: modeRow } = await service.from("app_settings").select("setting_value").eq("setting_key", "whatsapp_mode").maybeSingle();
    const mode = (modeRow?.setting_value as { mode?: string } | null)?.mode;
    const { data: company } = await service.from("agent_whatsapp_connections").select(SAFE_COLUMNS).eq("scope", "company").limit(1).maybeSingle();
    return json({
      ok: true,
      live_enabled: Deno.env.get("WHATSAPP_LIVE_ENABLED") === "true",
      app_secret_configured: !!Deno.env.get("META_APP_SECRET"),
      verify_token_configured: !!Deno.env.get("WHATSAPP_VERIFY_TOKEN"),
      mode: mode === "shared" || mode === "individual" ? mode : "undecided",
      webhook_url: `${SUPABASE_URL}/functions/v1/whatsapp-webhook`,
      company_connection: company ?? null,
      can_manage: canManage(auth.teamMember),
    });
  }

  // ---- set_mode: managers choose shared company number or individual agent numbers.
  if (body.action === "set_mode") {
    if (!canManage(auth.teamMember)) return json({ error: "Only a manager can choose the WhatsApp model." }, 403);
    if (body.mode !== "shared" && body.mode !== "individual" && body.mode !== "undecided") return json({ error: "mode must be shared, individual or undecided" }, 400);
    const { data: existingRow } = await service.from("app_settings").select("id").eq("setting_key", "whatsapp_mode").maybeSingle();
    const write = existingRow
      ? await service.from("app_settings").update({ setting_value: { mode: body.mode } }).eq("id", existingRow.id)
      : await service.from("app_settings").insert({ setting_key: "whatsapp_mode", setting_value: { mode: body.mode } });
    if (write.error) return json({ error: "Could not save the setting." }, 500);
    return json({ ok: true, mode: body.mode });
  }

  const { data: existing } = await service.from("agent_whatsapp_connections").select("*").eq("team_member_id", teamMemberId).maybeSingle();

  if (body.action === "disconnect") {
    if (existing) {
      if (existing.scope === "company" && !canManage(auth.teamMember)) return json({ error: "Only a manager can disconnect the company number." }, 403);
      if (existing.access_token_secret_id) await service.rpc("vault_delete_secret", { _id: existing.access_token_secret_id });
      if (existing.webhook_verify_token_secret_id) await service.rpc("vault_delete_secret", { _id: existing.webhook_verify_token_secret_id });
      if (existing.phone_number_id) await service.from("whatsapp_webhook_routes").delete().eq("phone_number_id", existing.phone_number_id);
      await service.from("agent_whatsapp_connections").delete().eq("team_member_id", teamMemberId);
    }
    return json({ ok: true, connection: null });
  }

  // ---- save
  const scope = body.scope === "company" ? "company" : "agent";
  if (scope === "company" && !canManage(auth.teamMember)) return json({ error: "Only a manager can connect the company number." }, 403);
  if (existing && existing.scope !== scope) {
    return json({ error: `You already have a ${existing.scope === "company" ? "company" : "personal"} WhatsApp connection. Disconnect it first.` }, 409);
  }
  if (scope === "company") {
    const { data: other } = await service.from("agent_whatsapp_connections").select("id").eq("scope", "company").neq("team_member_id", teamMemberId).limit(1).maybeSingle();
    if (other) return json({ error: "A company number is already connected. Disconnect it first." }, 409);
  }

  const phone_number_id = body.phone_number_id?.trim();
  const waba_id = body.waba_id?.trim() || null;
  const display_phone_number = body.display_phone_number?.trim() || null;
  const access_token = body.access_token?.trim();
  const webhook_verify_token = body.webhook_verify_token?.trim() || null;

  if (!phone_number_id || !/^\d{5,25}$/.test(phone_number_id)) return json({ error: "phone_number_id is required and must be the numeric ID from Meta." }, 400);

  // A Meta phone number belongs to exactly one connection.
  const { data: owner } = await service.from("agent_whatsapp_connections").select("team_member_id").eq("phone_number_id", phone_number_id).maybeSingle();
  if (owner && owner.team_member_id !== teamMemberId) return json({ error: "That phone number is already connected by someone else." }, 409);

  let accessTokenSecretId = existing?.access_token_secret_id ?? null;
  if (access_token) {
    if (accessTokenSecretId) {
      await service.rpc("vault_update_secret", { _id: accessTokenSecretId, _secret: access_token });
    } else {
      const { data: newId, error } = await service.rpc("vault_create_secret", { _secret: access_token, _name: `whatsapp_token:${teamMemberId}` });
      if (error) return json({ error: "Failed to store access token securely" }, 500);
      accessTokenSecretId = newId;
    }
  } else if (!existing) {
    return json({ error: "access_token is required for a new connection" }, 400);
  }

  let verifyTokenSecretId = existing?.webhook_verify_token_secret_id ?? null;
  if (webhook_verify_token) {
    if (verifyTokenSecretId) {
      await service.rpc("vault_update_secret", { _id: verifyTokenSecretId, _secret: webhook_verify_token });
    } else {
      const { data: newId, error } = await service.rpc("vault_create_secret", { _secret: webhook_verify_token, _name: `whatsapp_verify:${teamMemberId}` });
      if (!error) verifyTokenSecretId = newId;
    }
  }

  const { data: saved, error: saveErr } = await service
    .from("agent_whatsapp_connections")
    .upsert(
      {
        team_member_id: teamMemberId,
        scope,
        phone_number_id,
        waba_id,
        display_phone_number,
        connection_status: "unverified",
        access_token_secret_id: accessTokenSecretId,
        webhook_verify_token_secret_id: verifyTokenSecretId,
      },
      { onConflict: "team_member_id" },
    )
    .select(SAFE_COLUMNS)
    .single();
  if (saveErr || !saved) return json({ error: saveErr?.message ?? "Failed to save connection" }, 500);

  if (existing?.phone_number_id && existing.phone_number_id !== phone_number_id) {
    await service.from("whatsapp_webhook_routes").delete().eq("phone_number_id", existing.phone_number_id);
  }
  await service.from("whatsapp_webhook_routes").upsert({ phone_number_id, team_member_id: teamMemberId }, { onConflict: "phone_number_id" });

  return json({ ok: true, connection: saved });
});
