// Self-service WhatsApp Business (Meta Cloud API) connection management.
// Every staff member manages ONLY their own connection — there is no global
// WhatsApp sender. The access token (and optional webhook verify token) are
// stored in Supabase Vault via the vault_* wrapper functions; this table
// never holds the raw secret, only a reference id.

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Body = {
  action?: "save" | "disconnect";
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
  if (!await checkRateLimit(req, service, "whatsapp-connection", 20)) return tooManyRequests(CORS);
  const auth = await resolveActiveCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const teamMemberId = auth.teamMember.id;

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const { data: existing } = await service
    .from("agent_whatsapp_connections")
    .select("*")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();

  if (body.action === "disconnect") {
    if (existing) {
      if (existing.access_token_secret_id) await service.rpc("vault_delete_secret", { _id: existing.access_token_secret_id });
      if (existing.webhook_verify_token_secret_id) await service.rpc("vault_delete_secret", { _id: existing.webhook_verify_token_secret_id });
      if (existing.phone_number_id) await service.from("whatsapp_webhook_routes").delete().eq("phone_number_id", existing.phone_number_id);
      await service.from("agent_whatsapp_connections").delete().eq("team_member_id", teamMemberId);
    }
    return json({ ok: true, connection: null });
  }

  // action === "save" (default)
  const phone_number_id = body.phone_number_id?.trim();
  const waba_id = body.waba_id?.trim() || null;
  const display_phone_number = body.display_phone_number?.trim() || null;
  const access_token = body.access_token?.trim();
  const webhook_verify_token = body.webhook_verify_token?.trim() || null;

  if (!phone_number_id) return json({ error: "phone_number_id is required" }, 400);

  let accessTokenSecretId = existing?.access_token_secret_id ?? null;
  if (access_token) {
    if (accessTokenSecretId) {
      await service.rpc("vault_update_secret", { _id: accessTokenSecretId, _secret: access_token });
    } else {
      const { data: newId, error } = await service.rpc("vault_create_secret", {
        _secret: access_token,
        _name: `whatsapp_token:${teamMemberId}`,
      });
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
      const { data: newId, error } = await service.rpc("vault_create_secret", {
        _secret: webhook_verify_token,
        _name: `whatsapp_verify:${teamMemberId}`,
      });
      if (!error) verifyTokenSecretId = newId;
    }
  }

  const payload = {
    team_member_id: teamMemberId,
    phone_number_id,
    waba_id,
    display_phone_number,
    connection_status: "unverified",
    access_token_secret_id: accessTokenSecretId,
    webhook_verify_token_secret_id: verifyTokenSecretId,
  };

  const { data: saved, error: saveErr } = await service
    .from("agent_whatsapp_connections")
    .upsert(payload, { onConflict: "team_member_id" })
    .select("id, team_member_id, phone_number_id, waba_id, display_phone_number, connection_status, last_verified_at, last_error, created_at, updated_at")
    .single();
  if (saveErr || !saved) return json({ error: saveErr?.message ?? "Failed to save connection" }, 500);

  // Keep the phone_number_id -> agent routing table in sync for inbound webhooks.
  if (existing?.phone_number_id && existing.phone_number_id !== phone_number_id) {
    await service.from("whatsapp_webhook_routes").delete().eq("phone_number_id", existing.phone_number_id);
  }
  await service.from("whatsapp_webhook_routes").upsert(
    { phone_number_id, team_member_id: teamMemberId },
    { onConflict: "phone_number_id" },
  );

  return json({ ok: true, connection: saved });
});
