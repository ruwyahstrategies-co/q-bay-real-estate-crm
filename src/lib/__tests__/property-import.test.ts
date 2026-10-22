import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_FIELDS,
  autoMatchColumns,
  validatePropertyRow,
  type ImportFieldKey,
  type ImportLookups,
} from "../property-import";
import {
  TEMPLATE_ROWS,
  buildPropertyImportTemplate,
  templateLists,
} from "../property-import-template";

const lookups: ImportLookups = {
  countries: [
    { id: "c-qa", name: "Qatar", is_active: true },
    { id: "c-ae", name: "United Arab Emirates", is_active: true },
  ],
  areas: [
    { id: "a-lusail", name: "Lusail", country_id: "c-qa", is_active: true },
    { id: "a-pearl", name: "The Pearl", country_id: "c-qa", is_active: true },
    { id: "a-marina-qa", name: "Marina", country_id: "c-qa", is_active: true },
    { id: "a-marina-ae", name: "Marina", country_id: "c-ae", is_active: true },
    { id: "a-old", name: "Old Area", country_id: "c-qa", is_active: false },
  ],
  places: [
    { id: "p-fox", name: "Fox Hills", area_id: "a-lusail", is_active: true },
    { id: "p-porto", name: "Porto Arabia", area_id: "a-pearl", is_active: true },
  ],
  developments: [{ id: "d-1", name: "Marina Towers" }],
  owners: [
    { id: "o-1", name: "Ahmed Al Mohannadi", code: "AA" },
    { id: "o-2", name: "Twin Owner", code: "TA" },
    { id: "o-3", name: "Twin Owner", code: "TB" },
  ],
  agents: [
    { id: "t-1", full_name: "Mona Mostafa", email: "mona@example.com", is_active: true },
    { id: "t-2", full_name: "Left Agent", email: "left@example.com", is_active: false },
  ],
  developers: [{ id: "dv-1", name: "Qatari Diar", is_active: true }],
};

const ALL = new Set<ImportFieldKey>(IMPORT_FIELDS.map((f) => f.key));
const good = {
  title: "2BR in Porto Arabia",
  purpose: "Sale",
  property_type: "Apartment",
  owner: "ahmed al mohannadi",
  agent: "Mona Mostafa",
};

test("a complete row is accepted and resolved to ids", () => {
  const r = validatePropertyRow(
    {
      ...good,
      country: "Qatar",
      area: "The Pearl",
      place: "porto arabia",
      price: "1,250,000",
      bedrooms: "2",
      currency: "qar",
    },
    ALL,
    lookups,
    false,
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.payload.owner_id, "o-1");
  assert.equal(r.payload.assigned_agent_id, "t-1");
  assert.equal(r.payload.country_id, "c-qa");
  assert.equal(r.payload.area_id, "a-pearl");
  assert.equal(r.payload.place_id, "p-porto");
  assert.equal(r.payload.price, 1250000);
  assert.equal(r.payload.bedrooms, 2);
  assert.equal(r.payload.currency, "QAR");
  assert.equal(r.payload.purpose, "sale");
  assert.equal(r.payload.location, "Porto Arabia, The Pearl");
});

test("a new property needs title, purpose, type, owner and agent", () => {
  const r = validatePropertyRow({}, ALL, lookups, false);
  for (const h of ["Title", "Purpose", "Property Type", "Owner", "Assigned Agent"]) {
    assert.ok(
      r.errors.some((e) => e.startsWith(`${h} is required`)),
      `missing error for ${h}`,
    );
  }
});

test("an update only needs the columns that change, and blank cells are left alone", () => {
  const r = validatePropertyRow({ price: "900000", title: "" }, ALL, lookups, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.payload, { price: 900000 });
});

test("plain Villa is refused; the two villa kinds are accepted", () => {
  const bad = validatePropertyRow({ ...good, property_type: "Villa" }, ALL, lookups, false);
  assert.ok(bad.errors.some((e) => e.includes("Villa Standalone or Villa Compound")));
  for (const t of ["Villa Standalone", "villa compound"]) {
    const ok = validatePropertyRow({ ...good, property_type: t }, ALL, lookups, false);
    assert.deepEqual(ok.errors, []);
  }
});

test("owner and agent must exist, be unambiguous and be active", () => {
  assert.ok(
    validatePropertyRow({ ...good, owner: "Nobody" }, ALL, lookups, false).errors.some((e) =>
      e.includes("was not found"),
    ),
  );
  assert.ok(
    validatePropertyRow({ ...good, owner: "Twin Owner" }, ALL, lookups, false).errors.some((e) =>
      e.includes("more than one owner"),
    ),
  );
  assert.equal(
    validatePropertyRow({ ...good, owner: "TB" }, ALL, lookups, false).payload.owner_id,
    "o-3",
  );
  assert.ok(
    validatePropertyRow({ ...good, agent: "Left Agent" }, ALL, lookups, false).errors.some((e) =>
      e.includes("inactive"),
    ),
  );
  assert.equal(
    validatePropertyRow({ ...good, agent: "MONA@example.com" }, ALL, lookups, false).payload
      .assigned_agent_id,
    "t-1",
  );
});

test("location levels must agree with each other", () => {
  // A place needs its area.
  assert.ok(
    validatePropertyRow({ ...good, place: "Fox Hills" }, ALL, lookups, false).errors.some((e) =>
      e.includes("needs a valid Area"),
    ),
  );
  // A place from a different area.
  assert.ok(
    validatePropertyRow(
      { ...good, area: "The Pearl", place: "Fox Hills" },
      ALL,
      lookups,
      false,
    ).errors.some((e) => e.includes("not found in The Pearl")),
  );
  // An area from a different country.
  assert.ok(
    validatePropertyRow(
      { ...good, country: "United Arab Emirates", area: "Lusail" },
      ALL,
      lookups,
      false,
    ).errors.some((e) => e.includes("not found in United Arab Emirates")),
  );
  // The same area name in two countries needs the country.
  assert.ok(
    validatePropertyRow({ ...good, area: "Marina" }, ALL, lookups, false).errors.some((e) =>
      e.includes("more than one country"),
    ),
  );
  assert.equal(
    validatePropertyRow(
      { ...good, country: "United Arab Emirates", area: "Marina" },
      ALL,
      lookups,
      false,
    ).payload.area_id,
    "a-marina-ae",
  );
  // The country is filled in from a unique area.
  assert.equal(
    validatePropertyRow({ ...good, area: "Lusail" }, ALL, lookups, false).payload.country_id,
    "c-qa",
  );
  // Inactive areas are refused.
  assert.ok(
    validatePropertyRow({ ...good, area: "Old Area" }, ALL, lookups, false).errors.some((e) =>
      e.includes("inactive"),
    ),
  );
});

test("numbers, choices and developers are checked, not silently dropped", () => {
  const r = validatePropertyRow(
    {
      ...good,
      price: "lots",
      bedrooms: "2.5",
      currency: "JPY",
      availability: "gone",
      furnishing_status: "XX",
      size_unit: "acres",
      developer: "Mystery Co",
      development: "Nowhere",
    },
    ALL,
    lookups,
    false,
  );
  for (const part of [
    "Price must",
    "Bedrooms must be a whole number",
    "Currency",
    "Availability",
    "Furnishing",
    "Size Unit",
    "not an approved developer",
    "Development",
  ]) {
    assert.ok(
      r.errors.some((e) => e.includes(part)),
      `missing error containing ${part}: ${r.errors.join(" | ")}`,
    );
  }
  const ok = validatePropertyRow(
    { ...good, developer: "qatari diar", development: "marina towers" },
    ALL,
    lookups,
    false,
  );
  assert.equal(ok.payload.developer, "Qatari Diar");
  assert.equal(ok.payload.development_id, "d-1");
});

test("a reference code typed on a new property is never copied into the payload", () => {
  const r = validatePropertyRow({ ...good, reference_code: "HAND-TYPED-1" }, ALL, lookups, false);
  assert.equal("reference_code" in r.payload, false);
});

test("template headings are matched to their fields", () => {
  const headers = IMPORT_FIELDS.map((f) => f.header + (f.required ? " *" : ""));
  const map = autoMatchColumns(headers);
  for (const f of IMPORT_FIELDS) assert.ok(map[f.key], `no match for ${f.key}`);
  assert.equal(map.development, "Development");
  assert.equal(map.developer, "Developer");
});

test(
  "the Excel template has the three sheets, drop-downs and a hidden Lists sheet",
  { timeout: 60_000 },
  async () => {
    const bytes = await buildPropertyImportTemplate(lookups);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    assert.deepEqual(
      wb.worksheets.map((w) => w.name),
      ["Properties", "Instructions", "Lists"],
    );
    assert.equal(wb.getWorksheet("Lists")!.state, "hidden");
    const sheet = wb.getWorksheet("Properties")!;
    const headers = IMPORT_FIELDS.map((f, i) => String(sheet.getCell(1, i + 1).value));
    assert.deepEqual(
      headers,
      IMPORT_FIELDS.map((f) => f.header + (f.required ? " *" : "")),
    );
    const col = (key: ImportFieldKey) => IMPORT_FIELDS.findIndex((f) => f.key === key) + 1;
    for (const key of [
      "purpose",
      "property_type",
      "owner",
      "agent",
      "country",
      "area",
      "place",
      "development",
      "developer",
      "currency",
      "availability",
    ] as ImportFieldKey[]) {
      const dv = sheet.getCell(2, col(key)).dataValidation;
      assert.equal(dv?.type, "list", `${key} should be a drop-down`);
      assert.ok(String(dv?.formulae?.[0]).startsWith("Lists!"));
      assert.equal(sheet.getCell(TEMPLATE_ROWS + 1, col(key)).dataValidation?.type, "list");
    }
    assert.equal(sheet.getCell(2, col("bedrooms")).dataValidation?.type, "whole");
    assert.equal(sheet.getCell(2, col("price")).dataValidation?.type, "decimal");
    // The lists carry live values: only active agents, and Villa Standalone/Compound as types.
    const lists = templateLists(lookups);
    assert.ok(!lists.find((l) => l.key === "agent")!.values.includes("Left Agent"));
    assert.ok(lists.find((l) => l.key === "property_type")!.values.includes("Villa Compound"));
    assert.ok(!lists.find((l) => l.key === "property_type")!.values.includes("Villa"));
  },
);
