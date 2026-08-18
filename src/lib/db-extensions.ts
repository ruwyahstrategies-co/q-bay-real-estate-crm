// Small typed overlays on top of the generated Database types
// (src/integrations/supabase/types.ts). Keep this file minimal --- as soon as
// the generated types cover something exactly, use them directly instead of
// adding a wrapper here.

import type { PermissionSet } from "./permissions";
import type { TeamMember } from "./db";

// team_members.permissions is generated as generic `Json | null`. Narrow it
// to the actual PermissionSet shape the app writes/reads everywhere else ---
// this is the same value public.current_team_permissions() returns from the
// database, so it must stay authoritative (see src/hooks/use-auth.tsx).
export type StaffTeamMember = Omit<TeamMember, "permissions"> & {
  permissions: PermissionSet | null;
};

/**
 * True when a Supabase/PostgREST error indicates a missing table/column.
 * Used only as a resilience fallback (e.g. usePipelineStages falling back to
 * a hard-coded stage list) in case a client is ever running against a schema
 * that predates a given migration --- not a general-purpose escape hatch.
 */
export function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && ["42P01", "42703", "PGRST205", "PGRST204"].includes(e.code)) return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}
