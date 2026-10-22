// Pipeline movement rules.
//
// The database enforces them (leads_enforce_forward_pipeline): ordinary staff may keep a lead where it is or
// move it to a LATER stage, by the position configured in pipeline_stages, and a Won or Lost lead is closed
// to them. A Super Administrator can move a lead to any stage, backwards included, to correct a mistake.
// Moving a lead INTO Won is reserved to people who can finalise a deal. These helpers only let the screens
// offer the moves that will be accepted. They use the live stage configuration, never alphabetical order or
// hard-coded labels.

import type { PipelineStageRow } from "@/lib/db";

type StageLike = Pick<PipelineStageRow, "stage_key" | "position" | "is_won" | "is_lost">;

export function findStage<T extends StageLike>(stages: T[], key: string | null | undefined): T | undefined {
  return key ? stages.find((s) => s.stage_key === key) : undefined;
}

/** A Won or Lost stage. A lead sitting in one is closed and cannot be moved again. */
export function isClosedStage(stages: StageLike[], key: string | null | undefined): boolean {
  const stage = findStage(stages, key);
  return !!stage && (stage.is_won || stage.is_lost);
}

/**
 * Why a move from one stage to another would be refused, or null when it is allowed. Staying in the same
 * stage is always allowed. A stage that is not configured (legacy data) is left to the database to judge.
 */
export type MoveRights = {
  /** Super Administrator: may correct a stage in any direction, closed leads included. */
  superAdmin?: boolean;
  /** May move a lead into Won (Super Administrator, authorised Administrator, Accounts). */
  canFinalizeWon?: boolean;
};

export function blockedMoveReason(
  stages: StageLike[],
  from: string,
  to: string,
  rights: MoveRights = {},
): string | null {
  if (from === to) return null;
  const current = findStage(stages, from);
  const target = findStage(stages, to);
  if (!current || !target) return null;
  if (target.is_won && !rights.superAdmin && !rights.canFinalizeWon) {
    return "Only a Super Administrator, an authorised Administrator or Accounts can mark a lead as Won. Move it to Documentation and they will finalise it.";
  }
  if (rights.superAdmin) return null;
  if (current.is_won || current.is_lost) {
    return `This lead is already closed (${current.is_won ? "Won" : "Lost"}) and cannot be moved.`;
  }
  if (target.position < current.position) {
    return "Leads can only move forward in the pipeline.";
  }
  return null;
}

/**
 * The stages a lead may be set to: its current stage plus every later one, in configured order. A closed
 * lead can only stay where it is.
 */
export function selectableStages<T extends StageLike>(
  stages: T[],
  current: string | null | undefined,
  rights: MoveRights = {},
): T[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  // A Super Administrator can correct a lead to any stage.
  if (rights.superAdmin) return ordered;
  const currentStage = findStage(ordered, current);
  const allowed = (s: T) => !s.is_won || !!rights.canFinalizeWon || s.stage_key === current;
  if (!currentStage) return ordered.filter(allowed);
  if (currentStage.is_won || currentStage.is_lost) return [currentStage];
  return ordered.filter((s) => s.position >= currentStage.position).filter(allowed);
}

/** True when moving from one stage to another goes backwards (only a Super Administrator may do this). */
export function isBackwardMove(stages: StageLike[], from: string, to: string): boolean {
  const current = findStage(stages, from);
  const target = findStage(stages, to);
  if (!current || !target || from === to) return false;
  return target.position < current.position || current.is_won || current.is_lost;
}
