// Administrative actions on an existing staff member's Supabase Auth login:
// resetting credentials and suspending/restoring access. Requires
// SUPABASE_SERVICE_ROLE_KEY — never callable safely from the browser directly.

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

// 10 years — effectively indefinite until explicitly reversed.
const SUSPEND_DURATION = "87600h";

type ManageStaffBody = {
  action?: string;
  team_member_id?: string;
  new_password?: string;
  is_active?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await checkRateLimit(req, "admin-manage-staff", 15))) return tooManyRequests(CORS);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = await authorizeAdminCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: ManageStaffBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action: string = body?.action;
  const team_member_id: string | undefined = body?.team_member_id;
  if (!team_member_id) return json({ error: "team_member_id is required" }, 400);

  const { data: member, error: memberErr } = await service
    .from("team_members")
    .select("*")
    .eq("id", team_member_id)
    .maybeSingle();
  if (memberErr || !member) return json({ error: "Team member not found" }, 404);

  const authUserId: string | null = (member as { user_id?: string | null }).user_id ?? null;
  if (!authUserId) {
    return json(
      {
        error:
          "This staff member has no linked login yet. Recreate their login from Team → Add member.",
      },
      409,
    );
  }

  if (action === "reset_password") {
    const new_password: string | undefined = body?.new_password;
    if (!new_password || new_password.length < 8)
      return json({ error: "new_password must be at least 8 characters" }, 400);
    const { error } = await service.auth.admin.updateUserById(authUserId, {
      password: new_password,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "set_active") {
    const is_active: boolean = !!body?.is_active;
    const { error: authErr } = await service.auth.admin.updateUserById(authUserId, {
      ban_duration: is_active ? "none" : SUSPEND_DURATION,
    });
    if (authErr) return json({ error: authErr.message }, 400);
    const { error: dbErr } = await service
      .from("team_members")
      .update({ is_active })
      .eq("id", team_member_id);
    if (dbErr) return json({ error: dbErr.message }, 400);
    return json({ ok: true });
  }

  return json({ error: `Unknown action "${action}"` }, 400);
});
