import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import {
  IMPORT_FIELDS,
  autoMatchColumns,
  importNorm,
  validatePropertyRow,
  type ImportFieldKey,
  type ImportLookups,
} from "../property-import";
import { buildPropertyImportTemplate } from "../property-import-template";
import { csvToTable, importableSheets, matrixToTable, sheetToTable } from "../spreadsheet-table";

const lookups: ImportLookups = {
  countries: [{ id: "c-qa", name: "Qatar", is_active: true }],
  areas: [{ id: "a-pearl", name: "The Pearl", country_id: "c-qa", is_active: true }],
  places: [{ id: "p-porto", name: "Porto Arabia", area_id: "a-pearl", is_active: true }],
  developments: [],
  owners: [{ id: "o-1", name: "Ahmed Al Mohannadi", code: "AA" }],
  agents: [{ id: "t-1", full_name: "Mona Mostafa", email: "mona@example.com", is_active: true }],
  developers: [],
};

/** Reads a mapped table the way the importer does and checks every row. */
function check(table: ReturnType<typeof sheetToTable>) {
  const mapping = autoMatchColumns(table.headers);
  const present = new Set(
    (Object.entries(mapping) as [ImportFieldKey, string][]).filter(([, c]) => !!c).map(([k]) => k),
  );
  return table.rows.map((row, i) => {
    const values: Partial<Record<ImportFieldKey, string>> = {};
    for (const [key, col] of Object.entries(mapping) as [ImportFieldKey, string][])
      values[key] = row[col] ?? "";
    return { line: table.lines[i], ...validatePropertyRow(values, present, lookups, false) };
  });
}

/** The downloadable template, filled in with a few rows, then read back as an .xlsx file would be uploaded. */
async function filledTemplate(rows: Record<string, string | number>[]): Promise<XLSX.WorkBook> {
  const bytes = await buildPropertyImportTemplate(lookups);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Properties")!;
  const col = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, c) => col.set(String(cell.value).replace(/ \*$/, ""), c));
  rows.forEach((r, i) => {
    for (const [header, value] of Object.entries(r))
      sheet.getRow(i + 2).getCell(col.get(header)!).value = value;
  });
  const out = await wb.xlsx.writeBuffer();
  return XLSX.read(new Uint8Array(out as ArrayBuffer), { type: "array" });
}

test("the downloaded template, filled in, reads back and every good row passes", async () => {
  const wb = await filledTemplate([
    {
      Title: "2BR Porto Arabia",
      Purpose: "Sale",
      "Property Type": "Apartment",
      Owner: "Ahmed Al Mohannadi",
      "Assigned Agent": "Mona Mostafa",
      Country: "Qatar",
      Area: "The Pearl",
      Place: "Porto Arabia",
      Price: 1250000,
      Bedrooms: 2,
    },
    {
      Title: "Rental",
      Purpose: "Rent",
      "Property Type": "Apartment",
      Owner: "AA",
      "Assigned Agent": "mona@example.com",
      Price: 12000,
    },
  ]);
  // The helper sheets are not offered; the template's own sheet is the default.
  const names = importableSheets(wb.SheetNames, importNorm);
  assert.deepEqual(names, ["Properties"]);
  const table = sheetToTable(wb.Sheets["Properties"]);
  assert.equal(table.headers.length, IMPORT_FIELDS.length);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.lines, [2, 3]);

  const results = check(table);
  assert.deepEqual(
    results.map((r) => r.errors),
    [[], []],
  );
  assert.equal(results[0].payload.owner_id, "o-1");
  assert.equal(results[0].payload.price, 1250000);
  assert.equal(results[0].payload.place_id, "p-porto");
  assert.equal(results[1].payload.purpose, "rent");
});

test("a template with headers and no rows still reports its columns", async () => {
  const wb = await filledTemplate([]);
  const table = sheetToTable(wb.Sheets["Properties"]);
  assert.equal(table.headers.length, IMPORT_FIELDS.length);
  assert.equal(table.rows.length, 0);
});

test("a bad row gets plain-language errors with the row number it has in the file", async () => {
  const wb = await filledTemplate([
    {
      Title: "Good",
      Purpose: "Sale",
      "Property Type": "Apartment",
      Owner: "AA",
      "Assigned Agent": "Mona Mostafa",
    },
    {
      Title: "Bad",
      Purpose: "Lease",
      "Property Type": "Castle",
      Owner: "Nobody",
      "Assigned Agent": "Mona Mostafa",
      Price: "abc",
      Bedrooms: "2.5",
    },
  ]);
  const [good, bad] = check(sheetToTable(wb.Sheets["Properties"]));
  assert.deepEqual(good.errors, []);
  assert.equal(bad.line, 3);
  const text = bad.errors.join("\n");
  assert.match(text, /Purpose "Lease" is not one of: Sale, Rent/);
  assert.match(text, /Property Type "Castle" is not one of/);
  assert.match(text, /Owner "Nobody" was not found/);
  assert.match(text, /Price must be a positive number \(found "abc"\)/);
  assert.match(text, /Bedrooms must be a whole number/);
});

test("csv: quoted commas, a byte-order mark and blank lines are handled, and line numbers stay true", () => {
  const csv =
    "﻿Title *,Purpose *,Property Type *,Owner *,Assigned Agent *,Price,Description\r\n" +
    '"Villa, with pool",Sale,Villa Standalone,AA,Mona Mostafa,"2,500,000","Line one\nline two"\r\n' +
    ",,,,,,\r\n" +
    "Flat,Rent,Apartment,AA,Mona Mostafa,9000,\r\n";
  const table = csvToTable(csv);
  assert.equal(table.headers[0], "Title *");
  // Rows are records, as in Excel: the line break inside the quoted description does not add a row.
  assert.deepEqual(table.lines, [2, 4]);
  assert.equal(table.rows[0]["Title *"], "Villa, with pool");
  const results = check(table);
  assert.deepEqual(
    results.map((r) => r.errors),
    [[], []],
  );
  assert.equal(results[0].payload.price, 2500000);
});

test("blank rows in the middle of a sheet are skipped without shifting later row numbers", () => {
  const table = matrixToTable([
    ["Title", "Purpose"],
    ["A", "Sale"],
    ["", ""],
    ["", ""],
    ["B", "Rent"],
  ]);
  assert.deepEqual(table.lines, [2, 5]);
  assert.deepEqual(
    table.rows.map((r) => r.Title),
    ["A", "B"],
  );
});

test("repeated and blank headers do not collide", () => {
  const table = matrixToTable([
    ["Price", "", "Price"],
    ["1", "x", "2"],
  ]);
  assert.deepEqual(table.headers, ["Price", "Price (2)"]);
  assert.deepEqual(table.rows[0], { Price: "1", "Price (2)": "2" });
});

test("an empty file gives no columns rather than throwing", () => {
  assert.deepEqual(csvToTable(""), { headers: [], rows: [], lines: [] });
  assert.deepEqual(csvToTable("\r\n\r\n"), { headers: [], rows: [], lines: [] });
});
