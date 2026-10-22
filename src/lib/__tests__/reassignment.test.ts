import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_DEADLINE_MINUTES, formatMinutes, parseDeadline, timeLeftLabel } from "../reassignment";

describe("parseDeadline", () => {
  it("turns an amount and a unit into whole minutes", () => {
    assert.deepEqual(parseDeadline("30", "minutes"), { minutes: 30 });
    assert.deepEqual(parseDeadline("2", "hours"), { minutes: 120 });
    assert.deepEqual(parseDeadline("1", "days"), { minutes: 1440 });
    assert.deepEqual(parseDeadline(" 24 ", "hours"), { minutes: 1440 });
  });

  it("accepts exactly the limit and nothing beyond it", () => {
    assert.deepEqual(parseDeadline("30", "days"), { minutes: MAX_DEADLINE_MINUTES });
    assert.match(parseDeadline("31", "days").error ?? "", /at most 30 days/);
    assert.match(parseDeadline("43201", "minutes").error ?? "", /at most 30 days/);
  });

  it("refuses empty, zero, decimal and negative values with a clear message", () => {
    assert.match(parseDeadline("", "hours").error ?? "", /Enter how long/);
    assert.match(parseDeadline("0", "hours").error ?? "", /at least 1 minute/);
    assert.match(parseDeadline("1.5", "hours").error ?? "", /whole number/);
    assert.match(parseDeadline("-2", "days").error ?? "", /whole number/);
    assert.match(parseDeadline("abc", "minutes").error ?? "", /whole number/);
  });
});

describe("formatMinutes", () => {
  it("reads naturally", () => {
    assert.equal(formatMinutes(1), "1 minute");
    assert.equal(formatMinutes(30), "30 minutes");
    assert.equal(formatMinutes(60), "1 hour");
    assert.equal(formatMinutes(125), "2 hours 5 minutes");
    assert.equal(formatMinutes(1440), "1 day");
    assert.equal(formatMinutes(1440 + 12 * 60), "1 day 12 hours");
  });
});

describe("timeLeftLabel", () => {
  const now = Date.parse("2026-10-22T10:00:00Z");
  it("counts down and then says Expired", () => {
    assert.equal(timeLeftLabel("2026-10-22T10:30:00Z", now), "30 minutes left");
    assert.equal(timeLeftLabel("2026-10-22T12:05:00Z", now), "2 hours 5 minutes left");
    assert.equal(timeLeftLabel("2026-10-22T10:00:00Z", now), "Expired");
    assert.equal(timeLeftLabel("2026-10-22T09:00:00Z", now), "Expired");
  });

  it("never shows 0 minutes left while there is still time", () => {
    assert.equal(timeLeftLabel("2026-10-22T10:00:10Z", now), "1 minute left");
  });
});
