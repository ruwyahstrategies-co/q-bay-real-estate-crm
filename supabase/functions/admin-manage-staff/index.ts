// Administrative actions on an existing staff member's Supabase Auth login:
// resetting credentials and suspending/restoring access. Requires
// SUPABASE_SERVICE_ROLE_KEY — never callable safely from the browser directly.
//
// Self-contained (no relative imports) — see note in admin-create-staff-user.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const SUSPEND_DURATION = "87600h";

type TeamMemberRow = { id: string; user_id: string | null; is_active: boolean | null; role: string | null; permissions: Record<string, string[]> | null };
type ResolvedCaller = { ok: true; userId: string; email: string | null; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

async function resolveActiveCaller(req: Request, serviceClient: SupabaseClient): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
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
function isAdminTeamMember(teamMember: TeamMemberRow): boolean {
  return teamMember.role === "administrator" || teamMember.role === "owner" || hasPermission(teamMember, "team", "manage");
}
async function authorizeAdminCaller(req: Request, serviceClient: SupabaseClient) {
  const resolved = await resolveActiveCaller(req, serviceClient);
  if (!resolved.ok) return resolved;
  if (!isAdminTeamMember(resolved.teamMember)) return { ok: false as const, status: 403, error: "Administrator access required" };
  return { ok: true as const, userId: resolved.userId, email: resolved.email };
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
function tooManyRequests() {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
}

type ManageStaffBody = { action?: string; team_member_id?: string; new_password?: string; is_active?: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!(await checkRateLimit(req, service, "admin-manage-staff", 15))) return tooManyRequests();

  const auth = await authorizeAdminCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: ManageStaffBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const action: string | undefined = body?.action;
  const team_member_id: string | undefined = body?.team_member_id;
  if (!team_member_id) return json({ error: "team_member_id is required" }, 400);

  const { data: member, error: memberErr } = await service.from("team_members").select("*").eq("id", team_member_id).maybeSingle();
  if (memberErr || !member) return json({ error: "Team member not found" }, 404);

  const authUserId: string | null = (member as { user_id?: string | null }).user_id ?? null;
  if (!authUserId) {
    return json({ error: "This staff member has no linked login yet. Recreate their login from Team → Add member." }, 409);
  }

  if (action === "reset_password") {
    const new_password: string | undefined = body?.new_password;
    if (!new_password || new_password.length < 8) return json({ error: "new_password must be at least 8 characters" }, 400);
    const { error } = await service.auth.admin.updateUserById(authUserId, { password: new_password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "set_active") {
    const is_active: boolean = !!body?.is_active;
    const { error: authErr } = await service.auth.admin.updateUserById(authUserId, { ban_duration: is_active ? "none" : SUSPEND_DURATION });
    if (authErr) return json({ error: authErr.message }, 400);
    const { error: dbErr } = await service.from("team_members").update({ is_active }).eq("id", team_member_id);
    if (dbErr) return json({ error: dbErr.message }, 400);
    return json({ ok: true });
  }

  return json({ error: `Unknown action "${action}"` }, 400);
});
