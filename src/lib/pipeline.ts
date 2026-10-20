// Forward-only Sales pipeline helpers.
//
// The database enforces the rule (leads_enforce_forward_pipeline): a lead may stay where it is or move to a
// LATER stage, by the position configured in pipeline_stages, and a Won or Lost lead is closed. These
// helpers only let the screens offer the moves that will be accepted. They use the live stage
// configuration, never alphabetical order or hard-coded labels.

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
export function blockedMoveReason(stages: StageLike[], from: string, to: string): string | null {
  if (from === to) return null;
  const current = findStage(stages, from);
  const target = findStage(stages, to);
  if (!current || !target) return null;
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
export function selectableStages<T extends StageLike>(stages: T[], current: string | null | undefined): T[] {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const currentStage = findStage(ordered, current);
  if (!currentStage) return ordered;
  if (currentStage.is_won || currentStage.is_lost) return [currentStage];
  return ordered.filter((s) => s.position >= currentStage.position);
}
