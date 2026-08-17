// Shared caller-resolution for edge functions that must only run for a real,
// active, linked staff member — no bootstrap/fallback shortcuts.
//
// Resolution is strictly: bearer token -> auth.users -> team_members row
// where user_id = auth.uid(). An authenticated user with no linked row, or
// whose row is inactive, is NOT authorized for anything. This mirrors
// src/hooks/use-auth.tsx and public.current_team_permissions() in the
// database exactly, so frontend, edge functions and RLS all agree.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type TeamMemberRow = {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
  role: string | null;
  permissions: Record<string, string[]> | null;
};

export type ResolvedCaller =
  | { ok: true; userId: string; email: string | null; teamMember: TeamMemberRow }
  | { ok: false; status: number; error: string };

export async function resolveActiveCaller(req: Request, serviceClient: SupabaseClient): Promise<ResolvedCaller> {
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

  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members")
    .select("id, user_id, is_active, role, permissions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberErr) {
    return { ok: false, status: 500, error: "Failed to resolve staff record" };
  }
  if (!teamMember) {
    return { ok: false, status: 403, error: "Account not provisioned. Ask an administrator to create your staff login." };
  }
  if (teamMember.is_active === false) {
    return { ok: false, status: 403, error: "Account is inactive." };
  }

  return { ok: true, userId: user.id, email: user.email ?? null, teamMember: teamMember as TeamMemberRow };
}

export function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

export function isAdminTeamMember(teamMember: TeamMemberRow): boolean {
  return teamMember.role === "administrator" || teamMember.role === "owner" || hasPermission(teamMember, "team", "manage");
}
