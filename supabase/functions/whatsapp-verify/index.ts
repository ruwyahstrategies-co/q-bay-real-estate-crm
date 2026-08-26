// Verifies the caller's own WhatsApp Business (Meta Cloud API) connection by
// calling Meta's Graph API for the stored phone_number_id. Never returns the
// access token — only connection status/metadata.

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
const GRAPH_VERSION = "v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await checkRateLimit(req, service, "whatsapp-verify", 10)) return tooManyRequests(CORS);
  const auth = await resolveActiveCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const { data: conn } = await service
    .from("agent_whatsapp_connections")
    .select("*")
    .eq("team_member_id", auth.teamMember.id)
    .maybeSingle();

  if (!conn) return json({ error: "No WhatsApp connection configured yet." }, 404);
  if (!conn.access_token_secret_id) return json({ error: "No access token stored for this connection." }, 400);

  const { data: token } = await service.rpc("vault_read_secret", { _id: conn.access_token_secret_id });
  if (!token) return json({ error: "Could not read stored access token." }, 500);

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${conn.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message ?? `Meta API error ${res.status}`;
      await service.from("agent_whatsapp_connections").update({
        connection_status: "error", last_error: msg.slice(0, 500),
      }).eq("id", conn.id);
      return json({ ok: false, error: msg }, 400);
    }

    const { data: updated } = await service
      .from("agent_whatsapp_connections")
      .update({
        connection_status: "connected",
        display_phone_number: data.display_phone_number ?? conn.display_phone_number,
        last_verified_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", conn.id)
      .select("id, phone_number_id, waba_id, display_phone_number, connection_status, last_verified_at")
      .single();

    return json({ ok: true, connection: updated, verified_name: data.verified_name ?? null });
  } catch (e) {
    const msg = (e as Error).message || "Verification failed";
    await service.from("agent_whatsapp_connections").update({ connection_status: "error", last_error: msg.slice(0, 500) }).eq("id", conn.id);
    return json({ ok: false, error: msg }, 502);
  }
});
