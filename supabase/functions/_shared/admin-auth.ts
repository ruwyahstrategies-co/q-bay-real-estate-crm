// Shared caller-authorization helper for staff-administration edge functions.
// Mirrors the frontend bootstrap-admin logic in src/hooks/use-auth.tsx: a
// logged-in user with no linked team_members row is treated as a bootstrap
// administrator (only an admin can create Supabase Auth logins in the first
// place, so an authenticated-but-unlinked caller is trusted).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type CallerAuthResult =
  | { ok: true; userId: string; email: string | null; isAdmin: boolean }
  | { ok: false; status: number; error: string };

export async function authorizeAdminCaller(
  req: Request,
  serviceClient: SupabaseClient,
): Promise<CallerAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }
  const token = authHeader.replace("Bearer ", "");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }
  const user = userData.user;

  type TeamMemberRow = {
    is_active?: boolean;
    role?: string | null;
    permissions?: { team?: string[] } | null;
  };
  let teamMember: TeamMemberRow | null = null;
  try {
    const { data } = await serviceClient
      .from("team_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    teamMember = data;
  } catch {
    /* user_id column may not exist yet */
  }
  if (!teamMember && user.email) {
    const { data } = await serviceClient
      .from("team_members")
      .select("*")
      .ilike("email", user.email)
      .maybeSingle();
    teamMember = data;
  }

  if (!teamMember) {
    // No linked staff row — bootstrap administrator.
    return { ok: true, userId: user.id, email: user.email ?? null, isAdmin: true };
  }

  if (teamMember.is_active === false) {
    return { ok: false, status: 403, error: "Account is inactive" };
  }

  const role = teamMember.role;
  const permissions = teamMember.permissions;
  const isAdmin =
    role === "administrator" ||
    role === "owner" ||
    (permissions && Array.isArray(permissions.team) && permissions.team.includes("manage"));

  if (!isAdmin) {
    return { ok: false, status: 403, error: "Administrator access required" };
  }

  return { ok: true, userId: user.id, email: user.email ?? null, isAdmin: true };
}
