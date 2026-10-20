import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fromQatarInputValue, qatarDayKey, toQatarInputValue } from "../qatar-time";

describe("Qatar time helpers", () => {
  it("a form value is read as Qatar time (UTC+3)", () => {
    assert.equal(fromQatarInputValue("2026-10-20T10:00"), "2026-10-20T07:00:00.000Z");
  });

  it("an instant is shown back as the same Qatar time", () => {
    assert.equal(toQatarInputValue("2026-10-20T07:00:00.000Z"), "2026-10-20T10:00");
  });

  it("round trip keeps the value", () => {
    const iso = fromQatarInputValue("2026-12-31T23:30");
    assert.equal(toQatarInputValue(iso), "2026-12-31T23:30");
  });

  it("a late-night viewing stays on its Qatar day, not the UTC day", () => {
    // 01:30 in Doha on the 21st is still the 20th in UTC.
    const iso = fromQatarInputValue("2026-10-21T01:30")!;
    assert.equal(iso.slice(0, 10), "2026-10-20");
    assert.equal(qatarDayKey(iso), "2026-10-21");
  });

  it("empty and invalid input give null", () => {
    assert.equal(fromQatarInputValue(""), null);
    assert.equal(fromQatarInputValue(null), null);
    assert.equal(fromQatarInputValue("not a date"), null);
    assert.equal(toQatarInputValue(null), "");
  });
});
