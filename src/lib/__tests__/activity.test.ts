import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_KINDS,
  attachmentProblem,
  followUpDueAt,
  isImageName,
  outcomeLabel,
  quickKindConfig,
} from "../activity";

describe("quick activity kinds", () => {
  it("covers calls, WhatsApp, emails, meetings and notes", () => {
    assert.deepEqual(
      QUICK_KINDS.map((k) => k.kind),
      ["call", "whatsapp", "email", "meeting", "note"],
    );
  });

  it("maps to the stored interaction types", () => {
    assert.equal(quickKindConfig("call").interactionType, "phone_call");
    assert.equal(quickKindConfig("whatsapp").interactionType, "whatsapp");
    assert.equal(quickKindConfig("email").interactionType, "email");
    assert.equal(quickKindConfig("meeting").interactionType, "meeting");
    assert.equal(quickKindConfig("note").interactionType, "manual_note");
  });

  it("only contact kinds have a direction, and a note has no outcome", () => {
    assert.equal(quickKindConfig("call").hasDirection, true);
    assert.equal(quickKindConfig("meeting").hasDirection, false);
    assert.equal(quickKindConfig("note").hasDirection, false);
    assert.equal(quickKindConfig("note").outcomes.length, 0);
  });
});

describe("outcomeLabel", () => {
  it("reads naturally and tolerates unknown values", () => {
    assert.equal(outcomeLabel("no_answer"), "No answer");
    assert.equal(outcomeLabel("read_no_reply"), "Read, no reply");
    assert.equal(outcomeLabel("something_new"), "something new");
    assert.equal(outcomeLabel(null), null);
    assert.equal(outcomeLabel(""), null);
  });
});

describe("followUpDueAt", () => {
  it("is 10:00 Qatar time, the requested number of days ahead", () => {
    // 2026-10-22 09:30 UTC is 12:30 in Qatar.
    const now = Date.parse("2026-10-22T09:30:00Z");
    assert.equal(followUpDueAt(1, now), "2026-10-23T07:00:00.000Z");
    assert.equal(followUpDueAt(7, now), "2026-10-29T07:00:00.000Z");
  });

  it("uses the Qatar calendar day, not the UTC one", () => {
    // 2026-10-22 22:30 UTC is already 23 October, 01:30 in Qatar.
    const now = Date.parse("2026-10-22T22:30:00Z");
    assert.equal(followUpDueAt(1, now), "2026-10-24T07:00:00.000Z");
  });
});

describe("attachmentProblem", () => {
  it("accepts screenshots, images and documents", () => {
    assert.equal(attachmentProblem("screenshot.png", 200_000), null);
    assert.equal(attachmentProblem("chat.JPG", 1_000_000), null);
    assert.equal(attachmentProblem("agreement.pdf", 5_000_000), null);
  });

  it("explains why a file is refused", () => {
    assert.match(attachmentProblem("virus.exe", 10) ?? "", /not supported/);
    assert.match(attachmentProblem("noextension", 10) ?? "", /not supported/);
    assert.match(attachmentProblem("big.png", 51 * 1024 * 1024) ?? "", /larger than 50 MB/);
    assert.match(attachmentProblem("empty.png", 0) ?? "", /empty/);
  });
});

describe("isImageName", () => {
  it("recognises image files", () => {
    assert.equal(isImageName("a.png"), true);
    assert.equal(isImageName("a.JPEG"), true);
    assert.equal(isImageName("a.pdf"), false);
  });
});
