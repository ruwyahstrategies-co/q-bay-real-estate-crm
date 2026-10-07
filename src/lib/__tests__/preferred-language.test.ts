import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { autoMapColumns, loadImportFile, planLeadImport, sheetToTable } from "../lead-import";
import {
  PREFERRED_LANGUAGES,
  normalizePreferredLanguage,
  preferredLanguageOptions,
} from "../preferred-language";

describe("preferred language list", () => {
  it("is exactly Arabic, English, French", () => {
    assert.deepEqual([...PREFERRED_LANGUAGES], ["Arabic", "English", "French"]);
  });

  it("normalises casing and spacing of the three languages only", () => {
    assert.equal(normalizePreferredLanguage("arabic"), "Arabic");
    assert.equal(normalizePreferredLanguage("ENGLISH"), "English");
    assert.equal(normalizePreferredLanguage("  french "), "French");
    assert.equal(normalizePreferredLanguage(""), "");
    assert.equal(normalizePreferredLanguage(null), "");
  });

  it("leaves any other value untouched (apart from trimming)", () => {
    assert.equal(normalizePreferredLanguage(" Hindi "), "Hindi");
    assert.equal(normalizePreferredLanguage("English, Arabic"), "English, Arabic");
  });
});

describe("preferred language dropdown options", () => {
  it("offers only the three languages for a new lead or a supported value", () => {
    for (const current of [null, "", "Arabic", "French"]) {
      assert.deepEqual(
        preferredLanguageOptions(current).map((o) => o.value),
        ["Arabic", "English", "French"],
      );
    }
  });

  it("keeps a legacy value visible, first and flagged, so editing never blanks it", () => {
    const opts = preferredLanguageOptions("Hindi");
    assert.equal(opts.length, 4);
    assert.deepEqual(opts[0], { value: "Hindi", label: "Hindi (legacy value)" });
    assert.deepEqual(
      opts.slice(1).map((o) => o.value),
      ["Arabic", "English", "French"],
    );
  });
});

describe("importer language handling", () => {
  function tableOf(rows: string[][]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array;
    const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
    const file = loadImportFile(
      "x.xlsx",
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    return sheetToTable((file as { workbook: XLSX.WorkBook }).workbook, "Sheet1");
  }

  const baseOptions = {
    defaultIntent: "sale" as const,
    defaultLeadSource: "Import",
    defaultAgentId: "m1",
    canAssignOthers: true,
    currentMemberId: "m1",
    teamMembers: [{ id: "m1", full_name: "Abdo", email: null, code: null }],
    stages: [{ key: "new_lead", label: "New Lead" }],
    newId: () => "id-1",
  };

  it("normalises casing on insert and keeps unrelated values as typed", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Preferred Language"],
      ["a", "55550001", "arabic"],
      ["b", "55550002", "FRENCH"],
      ["c", "55550003", "Hindi"],
      ["d", "55550004", ""],
    ]);
    const plan = planLeadImport(t, autoMapColumns(t.headers), {
      ...baseOptions,
      duplicateAction: "skip",
      existing: [],
    });
    assert.deepEqual(
      plan.rows.map((r) => r.payload?.preferred_language),
      ["Arabic", "French", "Hindi", null],
    );
  });

  it("normalises casing when updating an existing lead", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Preferred Language"],
      ["a", "55550001", "english"],
    ]);
    const plan = planLeadImport(t, autoMapColumns(t.headers), {
      ...baseOptions,
      duplicateAction: "update",
      existing: [{ id: "L1", phone: "55550001", email: null }],
    });
    assert.equal(plan.rows[0].status, "update");
    assert.equal(plan.rows[0].patch?.preferred_language, "English");
  });
});
