// Caller-authorization helper for normal (non-admin) CRM-user edge
// functions — requires a valid, active, linked staff account plus the
// specific module/action permission(s) the function performs, read from
// trusted database state (never from the request body).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, hasPermission, type TeamMemberRow } from "./auth.ts";

export type CallerAuthResult =
  | { ok: true; userId: string; email: string | null; teamMember: TeamMemberRow }
  | { ok: false; status: number; error: string };

/**
 * Resolves the caller and requires every (module, action) pair in `checks`
 * to be present in their stored permissions.
 */
export async function authorizeCaller(
  req: Request,
  serviceClient: SupabaseClient,
  checks: { module: string; action: string }[],
): Promise<CallerAuthResult> {
  const resolved = await resolveActiveCaller(req, serviceClient);
  if (!resolved.ok) return resolved;

  for (const { module: moduleKey, action } of checks) {
    if (!hasPermission(resolved.teamMember, moduleKey, action)) {
      return { ok: false, status: 403, error: `Missing permission: ${moduleKey}.${action}` };
    }
  }

  return { ok: true, userId: resolved.userId, email: resolved.email, teamMember: resolved.teamMember };
}
