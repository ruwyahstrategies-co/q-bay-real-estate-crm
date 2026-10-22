import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLeadTimeline, type TimelineInput } from "../lead-timeline";

const NAMES: Record<string, string> = {
  "u-amal": "Amal",
  "m-amal": "Amal",
  "u-omar": "Omar",
  "m-omar": "Omar",
};

function base(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    lead: { id: "l1", created_at: "2026-10-01T08:00:00Z", created_by: "u-amal" },
    actorName: (id) => (id ? (NAMES[id] ?? null) : null),
    stageLabel: (k) => k.replace(/_/g, " "),
    history: [],
    interactions: [],
    attachmentsByInteraction: new Map(),
    notes: [],
    tasks: [],
    files: [],
    assignments: [],
    viewings: [],
    offers: [],
    ...over,
  };
}

describe("buildLeadTimeline", () => {
  it("starts with who created the lead", () => {
    const t = buildLeadTimeline(base());
    assert.equal(t.length, 1);
    assert.equal(t[0].title, "Lead created");
    assert.equal(t[0].actor, "Amal");
  });

  it("keeps every contact attempt as its own entry, even several in the same stage", () => {
    const mk = (id: string, at: string) => ({
      id,
      interaction_type: "phone_call",
      direction: "outbound",
      subject: null,
      content: null,
      interaction_date: at,
      created_by: "u-amal",
      actor_team_member_id: "m-amal",
      lead_stage: "contacted",
      outcome: "no_answer",
      duration_seconds: null,
    });
    const t = buildLeadTimeline(
      base({
        interactions: [
          mk("a", "2026-10-02T09:00:00Z"),
          mk("b", "2026-10-02T09:30:00Z"),
          mk("c", "2026-10-02T10:00:00Z"),
        ],
      }),
    );
    const contacts = t.filter((e) => e.category === "contact");
    assert.equal(contacts.length, 3);
    assert.ok(contacts.every((c) => c.stage === "contacted" && c.actor === "Amal"));
    assert.equal(contacts[0].title, "Call · outbound · No answer");
  });

  it("is ordered newest first", () => {
    const t = buildLeadTimeline(
      base({
        notes: [
          { id: "n1", content: "hello", created_at: "2026-10-05T10:00:00Z", author_id: "m-omar" },
        ],
        tasks: [
          {
            id: "t1",
            title: "Call back",
            created_at: "2026-10-03T10:00:00Z",
            created_by: "u-amal",
            completed_at: "2026-10-06T10:00:00Z",
          },
        ],
      }),
    );
    assert.deepEqual(
      t.map((e) => e.id),
      ["task-done-t1", "note-n1", "task-t1", "lead-l1"],
    );
  });

  it("labels corrections, restarts and closings, with the reason and who did it", () => {
    const t = buildLeadTimeline(
      base({
        history: [
          {
            id: "h0",
            previous_stage: null,
            new_stage: "new_lead",
            changed_at: "2026-10-01T08:00:00Z",
            changed_by: "u-amal",
            changed_by_member: "m-amal",
            kind: "created",
            reason: null,
          },
          {
            id: "h1",
            previous_stage: "documentation",
            new_stage: "contacted",
            changed_at: "2026-10-04T08:00:00Z",
            changed_by: "u-omar",
            changed_by_member: "m-omar",
            kind: "correction",
            reason: "Wrong column",
          },
          {
            id: "h2",
            previous_stage: "qualified",
            new_stage: "new_lead",
            changed_at: "2026-10-05T08:00:00Z",
            changed_by: null,
            changed_by_member: "m-amal",
            kind: "reassignment_reset",
            reason: "Handed over",
          },
          {
            id: "h3",
            previous_stage: "documentation",
            new_stage: "won",
            changed_at: "2026-10-06T08:00:00Z",
            changed_by: "u-omar",
            changed_by_member: null,
            kind: "closing",
            reason: "Sold: Villa",
          },
        ],
      }),
    );
    const byId = new Map(t.map((e) => [e.id, e]));
    assert.equal(byId.has("stage-h0"), false, "the creation row is the same fact as Lead created");
    assert.equal(byId.get("stage-h1")?.title, "Stage corrected: documentation back to contacted");
    assert.equal(byId.get("stage-h1")?.detail, "Wrong column");
    assert.equal(byId.get("stage-h1")?.actor, "Omar");
    assert.equal(byId.get("stage-h2")?.title, "Pipeline restarted at new lead");
    assert.equal(byId.get("stage-h3")?.title, "Deal closed: won");
    assert.equal(
      byId.get("stage-h3")?.actor,
      "Omar",
      "falls back to the user id when no member is recorded",
    );
  });

  it("puts evidence on its conversation instead of listing it as a separate file", () => {
    const t = buildLeadTimeline(
      base({
        interactions: [
          {
            id: "i1",
            interaction_type: "whatsapp",
            direction: "inbound",
            subject: null,
            content: "sent the offer",
            interaction_date: "2026-10-02T09:00:00Z",
            created_by: "u-amal",
            actor_team_member_id: null,
            lead_stage: null,
            outcome: null,
            duration_seconds: null,
          },
        ],
        attachmentsByInteraction: new Map([["i1", ["f1", "f2"]]]),
        files: [
          {
            id: "f1",
            filename: "screen.png",
            created_at: "2026-10-02T09:01:00Z",
            uploaded_by: "u-amal",
            interaction_id: "i1",
          },
          {
            id: "f2",
            filename: "chat.png",
            created_at: "2026-10-02T09:01:00Z",
            uploaded_by: "u-amal",
            interaction_id: "i1",
          },
          {
            id: "f3",
            filename: "id.pdf",
            created_at: "2026-10-03T09:00:00Z",
            uploaded_by: "u-omar",
            interaction_id: null,
          },
        ],
      }),
    );
    assert.deepEqual(t.find((e) => e.id === "interaction-i1")?.attachmentIds, ["f1", "f2"]);
    assert.equal(t.filter((e) => e.category === "file").length, 1);
    assert.equal(t.find((e) => e.id === "file-f3")?.actor, "Omar");
  });

  it("tells the system from a person when nobody is recorded", () => {
    const t = buildLeadTimeline(
      base({
        assignments: [
          {
            id: "a1",
            created_at: "2026-10-07T00:00:00Z",
            title: "Handover expired",
            detail: "No answer",
          },
        ],
      }),
    );
    assert.equal(t[0].actor, null);
    assert.equal(t[0].category, "handover");
  });
});
