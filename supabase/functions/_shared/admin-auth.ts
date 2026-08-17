// Caller-authorization helper for staff-administration edge functions.
//
// Requires a valid, active, linked team_members row (see ./auth.ts) AND
// admin-equivalent access (role administrator/owner, or explicit
// team.manage permission — both read from trusted database state, never
// from the request body). An unlinked or inactive caller is always denied —
// there is no bootstrap/fallback admin path here anymore; a real linked
// administrator is expected to exist before this function is ever called.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, isAdminTeamMember } from "./auth.ts";

export type CallerAuthResult =
  | { ok: true; userId: string; email: string | null; isAdmin: boolean }
  | { ok: false; status: number; error: string };

export async function authorizeAdminCaller(req: Request, serviceClient: SupabaseClient): Promise<CallerAuthResult> {
  const resolved = await resolveActiveCaller(req, serviceClient);
  if (!resolved.ok) return resolved;

  if (!isAdminTeamMember(resolved.teamMember)) {
    return { ok: false, status: 403, error: "Administrator access required" };
  }

  return { ok: true, userId: resolved.userId, email: resolved.email, isAdmin: true };
}
