// Transitional types for backend structures that the frontend expects but
// that do not exist in `src/integrations/supabase/types.ts` yet (that file is
// auto-generated from the live Supabase schema and must not be hand-edited).
//
// Everything in this file describes the CONTRACT the backend must satisfy —
// see BACKEND_REQUIREMENTS.md. Once Lovable applies the corresponding
// migration and regenerates types.ts, the fields below should be folded into
// the generated `Database` type and this file trimmed down or removed.
//
// Queries against these columns/tables are wrapped in try/catch by the hooks
// that use them, so the app keeps working (falling back to legacy behaviour)
// until the backend catches up.

import type { PermissionSet } from "./permissions";
import type { TeamMember } from "./db";

/**
 * Escape hatch for querying tables/columns not yet in the generated
 * `Database` type (see file header). Centralising the `any` here means only
 * one line needs the lint exception, instead of one per call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UntypedSupabase = any;

// team_members.user_id (uuid, references auth.users) — links a staff row to
// a real Supabase Auth account.
// team_members.permissions (jsonb) — a PermissionSet override for that member.
export type StaffTeamMember = TeamMember & {
  user_id?: string | null;
  permissions?: PermissionSet | null;
};

// New table: pipeline_stages
export type PipelineStageRow = {
  id: string;
  organisation_id: string | null;
  stage_key: string;
  name: string;
  position: number;
  is_active: boolean;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
};

export type PipelineStageInsert = Partial<
  Omit<PipelineStageRow, "id" | "created_at" | "updated_at">
> & {
  stage_key: string;
  name: string;
};

export type PipelineStageUpdate = Partial<
  Omit<PipelineStageRow, "id" | "created_at" | "updated_at">
>;

/** True when a Supabase/PostgREST error indicates a missing table/column — i.e. the backend hasn't caught up yet. */
export function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  // PostgREST: 42P01 undefined_table, 42703 undefined_column. PostgREST also
  // surfaces schema-cache misses as PGRST205/PGRST204.
  if (e.code && ["42P01", "42703", "PGRST205", "PGRST204"].includes(e.code)) return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}
