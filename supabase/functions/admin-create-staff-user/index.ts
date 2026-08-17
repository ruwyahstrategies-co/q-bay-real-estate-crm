// Creates a real Supabase Auth login for a staff member and links it to a
// team_members row. Requires SUPABASE_SERVICE_ROLE_KEY (server-only) because
// creating auth users needs the Supabase Admin API — this must never be done
// from the browser with a publishable key.
//
// verify_jwt = false at the platform level (like the other functions in this
// repo) — this function performs its own authorization via authorizeAdminCaller,
// which requires a valid bearer token AND admin-equivalent access.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizeAdminCaller } from "../_shared/admin-auth.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code;
  const msg = String(e?.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

type CreateStaffBody = {
  full_name?: string;
  email?: string;
  temporary_password?: string;
  phone?: string | null;
  role?: string;
  permissions?: Record<string, string[]> | null;
  is_active?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await checkRateLimit(req, "admin-create-staff-user", 10))) return tooManyRequests(CORS);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = await authorizeAdminCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: CreateStaffBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const full_name: string | undefined = body?.full_name?.trim();
  const email: string | undefined = body?.email?.trim()?.toLowerCase();
  const temporary_password: string | undefined = body?.temporary_password;
  const phone: string | null = body?.phone || null;
  const role: string = body?.role || "sales_agent";
  const permissions = body?.permissions ?? null;
  const is_active: boolean = body?.is_active ?? true;

  if (!full_name) return json({ error: "full_name is required" }, 400);
  if (!email) return json({ error: "email is required" }, 400);
  if (!temporary_password || temporary_password.length < 8) {
    return json({ error: "temporary_password must be at least 8 characters" }, 400);
  }

  // Create (or reuse) the Supabase Auth user.
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password: temporary_password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  let authUserId: string;
  if (createErr) {
    const alreadyExists = /already.*registered|already exists/i.test(createErr.message);
    if (!alreadyExists) return json({ error: createErr.message }, 400);
    // Look the existing auth user up by email so we can still link/update team_members.
    const { data: list, error: listErr } = await service.auth.admin.listUsers();
    if (listErr) return json({ error: "Could not resolve existing account" }, 500);
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) return json({ error: createErr.message }, 400);
    authUserId = existing.id;
  } else {
    authUserId = created.user.id;
  }

  // Link (or create) the team_members row.
  const { data: existingMember } = await service
    .from("team_members")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  const basePayload: Record<string, unknown> = {
    full_name,
    email,
    phone,
    role,
    is_active,
  };

  let linkWarning: string | null = null;

  async function upsertWithUserId(payload: Record<string, unknown>) {
    const withLink = { ...payload, user_id: authUserId, permissions };
    if (existingMember) {
      return service
        .from("team_members")
        .update(withLink)
        .eq("id", existingMember.id)
        .select()
        .single();
    }
    return service.from("team_members").insert(withLink).select().single();
  }

  let { data, error } = await upsertWithUserId(basePayload);
  if (error && isMissingColumn(error)) {
    // team_members.user_id / .permissions not migrated yet — fall back so
    // staff creation still works today, minus the auth link.
    linkWarning =
      "team_members.user_id/.permissions column not found — staff row was saved without the auth link. Apply the migration in BACKEND_REQUIREMENTS.md.";
    const fallback = existingMember
      ? await service
          .from("team_members")
          .update(basePayload)
          .eq("id", existingMember.id)
          .select()
          .single()
      : await service.from("team_members").insert(basePayload).select().single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    return json({ error: error?.message ?? "Failed to save team member" }, 500);
  }

  return json({ team_member: data, auth_user_id: authUserId, warning: linkWarning });
});
