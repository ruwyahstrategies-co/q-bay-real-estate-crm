// Creates a real Supabase Auth login for a staff member and links it to a
// team_members row. Requires SUPABASE_SERVICE_ROLE_KEY (server-only) because
// creating auth users needs the Supabase Admin API — this must never be done
// from the browser with a publishable key.
//
// Self-contained (no relative imports) — deployed as a single file via the
// Supabase management API, which does not bundle multi-file/shared-folder
// edge functions reliably. See supabase/functions/_shared/*.ts for the
// canonical, documented version of this logic if deploying via the CLI.

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

type CreateStaffBody = {
  full_name?: string;
  email?: string;
  temporary_password?: string;
  phone?: string | null;
  role?: string;
  team_id?: string | null;
  permissions?: Record<string, string[]> | null;
  is_active?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!(await checkRateLimit(req, service, "admin-create-staff-user", 10))) return tooManyRequests();

  const auth = await authorizeAdminCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: CreateStaffBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const full_name: string | undefined = body?.full_name?.trim();
  const email: string | undefined = body?.email?.trim()?.toLowerCase();
  const temporary_password: string | undefined = body?.temporary_password;
  const phone: string | null = body?.phone || null;
  const role: string = body?.role || "sales_agent";
  const team_id: string | null = body?.team_id || null;
  const permissions = body?.permissions ?? null;
  const is_active: boolean = body?.is_active ?? true;

  if (!full_name) return json({ error: "full_name is required" }, 400);
  if (!email) return json({ error: "email is required" }, 400);
  if (!temporary_password || temporary_password.length < 8) {
    return json({ error: "temporary_password must be at least 8 characters" }, 400);
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password: temporary_password, email_confirm: true, user_metadata: { full_name },
  });

  let authUserId: string;
  let linkWarning: string | null = null;
  if (createErr) {
    const alreadyExists = /already.*registered|already exists/i.test(createErr.message);
    if (!alreadyExists) return json({ error: createErr.message }, 400);
    const { data: list, error: listErr } = await service.auth.admin.listUsers();
    if (listErr) return json({ error: "Could not resolve existing account" }, 500);
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) return json({ error: createErr.message }, 400);
    authUserId = existing.id;
    linkWarning = "A Supabase Auth account with this email already existed and was linked instead of creating a new one. The temporary password was NOT applied to that existing account.";
  } else {
    authUserId = created.user.id;
  }

  const { data: existingMember } = await service.from("team_members").select("id").ilike("email", email).maybeSingle();

  const payload: Record<string, unknown> = { full_name, email, phone, role, team_id, is_active, user_id: authUserId, permissions };

  const { data, error } = existingMember
    ? await service.from("team_members").update(payload).eq("id", existingMember.id).select().single()
    : await service.from("team_members").insert(payload).select().single();

  if (error || !data) return json({ error: error?.message ?? "Failed to save team member" }, 500);

  return json({ team_member: data, auth_user_id: authUserId, warning: linkWarning });
});
