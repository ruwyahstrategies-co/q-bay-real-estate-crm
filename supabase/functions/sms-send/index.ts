// Processes due scheduled_notifications (module H). Provider-independent:
// no SMS provider is configured yet, so every attempt is honestly recorded
// as 'skipped' with a clear reason rather than pretending to have sent
// anything. When the client supplies a provider, only sendViaProvider()
// needs a real implementation - nothing else in this pipeline changes.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = { id: string; user_id: string | null; is_active: boolean | null; role: string | null; permissions: Record<string, string[]> | null };
type ResolvedCaller = { ok: true; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

async function resolveActiveCaller(req: Request, serviceClient: SupabaseClient): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };
  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members").select("id, user_id, is_active, role, permissions").eq("user_id", userData.user.id).maybeSingle();
  if (memberErr) return { ok: false, status: 500, error: "Failed to resolve staff record" };
  if (!teamMember) return { ok: false, status: 403, error: "Account not provisioned." };
  if (teamMember.is_active === false) return { ok: false, status: 403, error: "Account is inactive." };
  return { ok: true, teamMember: teamMember as TeamMemberRow };
}

function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type ProviderConfig = { provider: string | null; sender_id: string | null; api_key_secret_id: string | null } | null;

/**
 * Provider abstraction point. Add a real branch here (Twilio, Vonage, a
 * local Qatar SMS gateway, etc.) once the client supplies credentials -
 * everything upstream (scheduling, dedup, retry, status tracking) already
 * works and does not need to change.
 */
async function sendViaProvider(
  _config: NonNullable<ProviderConfig>,
  _to: string,
  _body: string,
): Promise<{ ok: true; providerMessageId: string } | { ok: false; error: string }> {
  return { ok: false, error: "No SMS provider is implemented yet. Configure one in Settings, then wire it up here." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Two ways in: an authenticated admin clicking "Process now" in Settings,
  // or a future cron trigger presenting the shared secret (never the
  // service-role key) stored in CRON_SHARED_SECRET.
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SHARED_SECRET");
  let isAuthorized = false;
  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
    isAuthorized = true;
  } else {
    const caller = await resolveActiveCaller(req, supabase);
    if (caller.ok && hasPermission(caller.teamMember, "settings", "manage")) isAuthorized = true;
  }
  if (!isAuthorized) return json({ error: "Not authorized to process notifications" }, 403);

  const { data: settingRow } = await supabase.from("app_settings").select("setting_value").eq("setting_key", "sms_provider_config").maybeSingle();
  const config = (settingRow?.setting_value ?? null) as ProviderConfig;
  const configured = !!(config?.provider && config?.api_key_secret_id);

  const { data: due, error: dueErr } = await supabase
    .from("scheduled_notifications")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(100);
  if (dueErr) return json({ error: dueErr.message }, 500);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of due ?? []) {
    if (!configured) {
      await supabase.from("scheduled_notifications").update({
        status: "skipped",
        error_message: "No SMS provider configured yet. Set one in Settings > Notifications.",
      }).eq("id", n.id);
      skipped++;
      continue;
    }
    if (!n.recipient_phone || !n.body) {
      await supabase.from("scheduled_notifications").update({ status: "skipped", error_message: "Missing recipient phone or message body." }).eq("id", n.id);
      skipped++;
      continue;
    }

    const result = await sendViaProvider(config!, n.recipient_phone, n.body);
    if (result.ok) {
      await supabase.from("scheduled_notifications").update({
        status: "sent", sent_at: new Date().toISOString(), provider: config!.provider, provider_message_id: result.providerMessageId,
      }).eq("id", n.id);
      sent++;
    } else {
      await supabase.from("scheduled_notifications").update({ status: "failed", error_message: result.error, provider: config!.provider }).eq("id", n.id);
      failed++;
    }
  }

  return json({ ok: true, processed: (due ?? []).length, sent, failed, skipped, provider_configured: configured });
});
