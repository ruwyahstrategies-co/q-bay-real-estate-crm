// Turns a spreadsheet sheet or a CSV file into the same simple table for the property import.
//
// Every row keeps the line number it has in the file the user opened, so an error message ("Row 14: ...") points
// at the row they can see in Excel even when blank rows sit in between. Blank rows are skipped, not counted away.

import Papa from "papaparse";
import * as XLSX from "xlsx";

export type TableRow = Record<string, string>;

export type SheetTable = {
  headers: string[];
  rows: TableRow[];
  /** lines[i] is the row number of rows[i] in the original file (the header is row 1). */
  lines: number[];
};

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/^\uFEFF/, "")
    .trim();

/** Headers made unique and non-empty: a repeated name gets " (2)", a blank header column is dropped. */
function uniqueHeaders(first: unknown[]): { name: string; col: number }[] {
  const seen = new Map<string, number>();
  const out: { name: string; col: number }[] = [];
  first.forEach((cell, col) => {
    const base = clean(cell);
    if (!base) return;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ name: n === 1 ? base : `${base} (${n})`, col });
  });
  return out;
}

/** The table inside a grid of cell text. The first non-empty row is the header row. */
export function matrixToTable(matrix: unknown[][]): SheetTable {
  const headerAt = matrix.findIndex((r) => r.some((c) => clean(c) !== ""));
  if (headerAt < 0) return { headers: [], rows: [], lines: [] };
  const columns = uniqueHeaders(matrix[headerAt]);
  const rows: TableRow[] = [];
  const lines: number[] = [];
  for (let i = headerAt + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells.some((c) => clean(c) !== "")) continue;
    const row: TableRow = {};
    for (const { name, col } of columns) row[name] = clean(cells[col]);
    rows.push(row);
    lines.push(i + 1);
  }
  return { headers: columns.map((c) => c.name), rows, lines };
}

/** One worksheet, read as the text Excel displays (so "1,250,000" and dates arrive the way the user typed them). */
export function sheetToTable(sheet: XLSX.WorkSheet): SheetTable {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  return matrixToTable(matrix);
}

/** A CSV file's text. Handles quoted commas and line breaks, and a leading byte-order mark. */
export function csvToTable(text: string): SheetTable {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: false });
  return matrixToTable(parsed.data);
}

/** The sheets a person can choose between: the template's helper sheets are never offered. */
export function importableSheets(names: string[], norm: (s: string) => string): string[] {
  return names.filter((n) => norm(n) !== "instructions" && norm(n) !== "lists");
}
