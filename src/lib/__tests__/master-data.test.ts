import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_VALUE,
  buildMasterFilterOptions,
  buildMasterOptions,
  initialMasterSelection,
  resolveMasterSelection,
} from "../master-data";
import type { MasterDataValue } from "../db";

function value(partial: Partial<MasterDataValue> & { id: string; name: string }): MasterDataValue {
  return {
    kind: "developer",
    is_active: true,
    display_order: 0,
    created_at: "2026-10-13T00:00:00Z",
    updated_at: "2026-10-13T00:00:00Z",
    ...partial,
  };
}

const taameer = value({ id: "t", name: "TAAMEER", display_order: 1 });
const shelter = value({ id: "s", name: "SHELTER", display_order: 0 });
const danube = value({ id: "d", name: "DANUBE", is_active: false, display_order: 2 });
const all = [taameer, shelter, danube];

describe("buildMasterOptions", () => {
  it("offers only active values, in display order", () => {
    assert.deepEqual(
      buildMasterOptions(all).map((o) => o.label),
      ["SHELTER", "TAAMEER"],
    );
  });

  it("keeps a deactivated value visible when the record already uses it", () => {
    const options = buildMasterOptions(all, { id: "d", text: "DANUBE" });
    assert.equal(options[0].value, "d");
    assert.equal(options[0].label, "DANUBE (inactive)");
  });

  it("does not offer a deactivated value to a record that does not use it", () => {
    const options = buildMasterOptions(all, { id: "t", text: "TAAMEER" });
    assert.ok(!options.some((o) => o.value === "d"));
  });

  it("keeps unmatched legacy text selectable instead of erasing it", () => {
    const options = buildMasterOptions(all, { id: null, text: " Old Builder " });
    assert.deepEqual(options[0], { value: LEGACY_VALUE, label: "Old Builder (not in list)" });
  });
});

describe("initialMasterSelection / resolveMasterSelection", () => {
  it("prefers the link, then the legacy marker, then empty", () => {
    assert.equal(initialMasterSelection({ id: "t", text: "x" }), "t");
    assert.equal(initialMasterSelection({ id: null, text: "Old Builder" }), LEGACY_VALUE);
    assert.equal(initialMasterSelection({ id: null, text: "  " }), "");
    assert.equal(initialMasterSelection(undefined), "");
  });

  it("writes the canonical name when an approved value is chosen", () => {
    assert.deepEqual(resolveMasterSelection("t", all), { id: "t", text: "TAAMEER" });
  });

  it("writes legacy text back unchanged", () => {
    assert.deepEqual(resolveMasterSelection(LEGACY_VALUE, all, "Old Builder"), {
      id: null,
      text: "Old Builder",
    });
  });

  it("clears both when nothing is selected or the id is unknown", () => {
    assert.deepEqual(resolveMasterSelection("", all), { id: null, text: null });
    assert.deepEqual(resolveMasterSelection("nope", all), { id: null, text: null });
  });
});

describe("buildMasterFilterOptions", () => {
  it("includes inactive values (records still carry them) and marks them", () => {
    const labels = buildMasterFilterOptions(all).map((o) => o.label);
    assert.deepEqual(labels, ["SHELTER", "TAAMEER", "DANUBE (inactive)"]);
  });
});
