import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blockedMoveReason, isClosedStage, selectableStages } from "../pipeline";

// Same configuration as the live pipeline_stages table.
const stage = (stage_key: string, position: number, extra: { is_won?: boolean; is_lost?: boolean } = {}) => ({
  stage_key,
  position,
  is_won: extra.is_won ?? false,
  is_lost: extra.is_lost ?? false,
});

const STAGES = [
  stage("new_lead", 0),
  stage("contacted", 1),
  stage("qualified", 2),
  stage("property_matching", 3),
  stage("viewing_scheduled", 4),
  stage("negotiation", 5),
  stage("documentation", 6),
  stage("won", 7, { is_won: true }),
  stage("lost", 8, { is_lost: true }),
];

describe("forward-only pipeline", () => {
  it("moving forward is allowed, including skipping stages", () => {
    assert.equal(blockedMoveReason(STAGES, "contacted", "qualified"), null);
    assert.equal(blockedMoveReason(STAGES, "new_lead", "negotiation"), null);
  });

  it("staying in the same stage is allowed", () => {
    assert.equal(blockedMoveReason(STAGES, "qualified", "qualified"), null);
  });

  it("moving backward is refused", () => {
    assert.notEqual(blockedMoveReason(STAGES, "negotiation", "contacted"), null);
    assert.notEqual(blockedMoveReason(STAGES, "viewing_scheduled", "new_lead"), null);
  });

  it("Won and Lost are closed", () => {
    assert.equal(isClosedStage(STAGES, "won"), true);
    assert.equal(isClosedStage(STAGES, "lost"), true);
    assert.equal(isClosedStage(STAGES, "negotiation"), false);
    assert.notEqual(blockedMoveReason(STAGES, "won", "negotiation"), null);
    assert.notEqual(blockedMoveReason(STAGES, "lost", "new_lead"), null);
    assert.notEqual(blockedMoveReason(STAGES, "won", "lost"), null);
  });

  it("an open lead can still be closed", () => {
    assert.equal(blockedMoveReason(STAGES, "documentation", "won"), null);
    assert.equal(blockedMoveReason(STAGES, "new_lead", "lost"), null);
  });

  it("order follows configured position, not the order of the list or the names", () => {
    const shuffled = [...STAGES].reverse();
    assert.notEqual(blockedMoveReason(shuffled, "qualified", "contacted"), null);
    assert.equal(blockedMoveReason(shuffled, "contacted", "qualified"), null);
    assert.deepEqual(selectableStages(shuffled, "qualified").map((s) => s.stage_key), [
      "qualified",
      "property_matching",
      "viewing_scheduled",
      "negotiation",
      "documentation",
      "won",
      "lost",
    ]);
  });

  it("a closed lead can only stay where it is", () => {
    assert.deepEqual(selectableStages(STAGES, "won").map((s) => s.stage_key), ["won"]);
    assert.deepEqual(selectableStages(STAGES, "lost").map((s) => s.stage_key), ["lost"]);
  });

  it("a stage that is not configured is left to the database", () => {
    assert.equal(blockedMoveReason(STAGES, "legacy_stage", "qualified"), null);
    assert.equal(selectableStages(STAGES, "legacy_stage").length, STAGES.length);
  });
});
