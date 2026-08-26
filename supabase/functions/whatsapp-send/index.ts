// Sends a WhatsApp message through the CALLING AGENT'S OWN Meta Cloud API
// connection — never a shared/global sender. Requires conversations.create.
// Supports free-text (only valid inside Meta's 24h customer-service window)
// and template sends (required to open/re-open a conversation) — Meta's
// template rules are enforced by the Graph API itself, not bypassed here.

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_VERSION = "v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Body = {
  lead_id?: string;
  to?: string;
  message?: string;
  template_name?: string;
  template_language?: string;
  template_params?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await checkRateLimit(req, service, "whatsapp-send", 20)) return tooManyRequests(CORS);
  const auth = await authorizeCaller(req, service, [{ module: "conversations", action: "create" }]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const to = body.to?.replace(/[^\d+]/g, "");
  if (!to) return json({ error: "to (recipient phone number) is required" }, 400);
  if (!body.message && !body.template_name) return json({ error: "message or template_name is required" }, 400);

  const { data: conn } = await service
    .from("agent_whatsapp_connections")
    .select("*")
    .eq("team_member_id", auth.teamMember.id)
    .maybeSingle();

  if (!conn) return json({ error: "You have no WhatsApp connection configured. Set one up in Settings first." }, 409);
  if (conn.connection_status !== "connected") {
    return json({ error: "Your WhatsApp connection is not verified yet. Verify it in Settings first." }, 409);
  }

  const { data: token } = await service.rpc("vault_read_secret", { _id: conn.access_token_secret_id });
  if (!token) return json({ error: "Could not read stored access token." }, 500);

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
  };
  if (body.template_name) {
    payload.type = "template";
    payload.template = {
      name: body.template_name,
      language: { code: body.template_language || "en_US" },
      components: body.template_params?.length
        ? [{ type: "body", parameters: body.template_params.map((p) => ({ type: "text", text: p })) }]
        : undefined,
    };
  } else {
    payload.type = "text";
    payload.text = { body: body.message };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${conn.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message ?? `Meta API error ${res.status}`;
      return json({ error: msg }, 502);
    }

    const messageId = data?.messages?.[0]?.id ?? null;

    if (body.lead_id) {
      await service.from("interactions").insert({
        lead_id: body.lead_id,
        interaction_type: "whatsapp",
        direction: "outbound",
        content: body.message ?? `[template: ${body.template_name}]`,
        created_by: auth.userId,
        metadata: { message_id: messageId, phone_number_id: conn.phone_number_id, to },
      });
    }

    return json({ ok: true, message_id: messageId });
  } catch (e) {
    return json({ error: (e as Error).message || "Send failed" }, 502);
  }
});
