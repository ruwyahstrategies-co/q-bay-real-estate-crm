// One-time bootstrap: creates the first Administrator login for a brand-new
// project. Refuses outright the moment ANY team_members row already exists —
// there is no bootstrap-admin fallback anywhere else in this system (unlike
// early iterations of this app), so this function is the single, narrow,
// self-disabling door for going from "empty database" to "first real admin".
//
// Call once: POST with { full_name, email }. Returns a generated temporary
// password ONE TIME — it is never stored. Rotate it immediately after first
// login (Team page, or admin-manage-staff's reset_password action).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return "Qb-" + Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

// Mirrors src/lib/permissions.ts MODULES exactly (every module, every
// action) — keep the two in sync whenever a module/action is added there.
const FULL_ACCESS = {
  overview: ["view"],
  leads: ["view", "view_team", "view_all", "create", "edit", "delete", "assign"],
  properties: ["view", "create", "edit", "delete", "publish"],
  developments: ["view", "create", "edit", "delete", "publish"],
  owners: ["view", "create", "edit", "delete"],
  locations: ["view", "manage"],
  viewings: ["view", "view_team", "view_all", "create", "edit", "complete"],
  offers: ["view", "view_team", "view_all", "create", "edit", "delete"],
  pipeline: ["view", "move"],
  conversations: ["view", "view_team", "view_all", "create", "edit", "delete"],
  uploads: ["view", "upload", "delete"],
  tasks: ["view", "view_team", "view_all", "create", "edit", "complete"],
  ai_insights: ["view", "run"],
  property_demand: ["view"],
  marketing_intelligence: ["view"],
  analytics: ["view"],
  journal: ["view", "create", "edit", "delete", "publish"],
  website_enquiries: ["view", "assign"],
  submissions: ["view", "review"],
  accounting: ["view", "manage"],
  staff_activity: ["view", "view_team", "view_all"],
  team: ["view", "manage"],
  settings: ["view", "manage"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count, error: countErr } = await service.from("team_members").select("id", { count: "exact", head: true });
  if (countErr) return json({ error: countErr.message }, 500);
  if ((count ?? 0) > 0) {
    return json({ error: "Bootstrap already completed — a team_members row already exists. Use Team → Add member instead." }, 409);
  }

  let body: { full_name?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const full_name = body.full_name?.trim();
  const email = body.email?.trim()?.toLowerCase();
  if (!full_name || !email) return json({ error: "full_name and email are required" }, 400);

  const password = generatePassword();

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr || !created?.user) return json({ error: createErr?.message ?? "Failed to create auth user" }, 400);

  const { data: org } = await service.from("organisations").select("id").limit(1).maybeSingle();

  const { data: member, error: memberErr } = await service
    .from("team_members")
    .insert({
      organisation_id: org?.id ?? null,
      full_name,
      email,
      role: "administrator",
      is_active: true,
      user_id: created.user.id,
      permissions: FULL_ACCESS,
    })
    .select()
    .single();

  if (memberErr || !member) {
    // Roll back the auth user so a retry isn't blocked by a dangling login.
    await service.auth.admin.deleteUser(created.user.id).catch(() => {});
    return json({ error: memberErr?.message ?? "Failed to create administrator record" }, 500);
  }

  return json({
    ok: true,
    email,
    temporary_password: password,
    warning: "Store this password now — it is never shown again. Sign in and rotate it immediately from Settings.",
  });
});
