// Builds the Excel template staff download before a bulk property import.
//
// Three sheets: "Properties" (the one to fill in, with drop-down lists on every column that has a fixed set of
// answers), "Instructions" (what each column means) and "Lists" (the values behind the drop-downs, hidden).
// The drop-downs are a convenience. Every row is checked again when the file is imported, because a cell can
// always be typed over or pasted into.

import {
  AVAILABILITY_CHOICES,
  CURRENCY_CHOICES,
  FURNISHING_CHOICES,
  IMPORT_FIELDS,
  PURPOSE_CHOICES,
  SIZE_UNIT_CHOICES,
  type ImportFieldKey,
  type ImportLookups,
} from "./property-import";
import { PROPERTY_TYPES } from "./property-types";

/** Rows the drop-downs and formats are applied to. A longer file still imports; only the helpers stop. */
export const TEMPLATE_ROWS = 500;

const GREEN_DARK = "FF0B2B26";
const GREEN_MID = "FF235347";
const MINT = "FFDAF1DE";

type ListSource = { key: ImportFieldKey; values: string[] };

export function templateLists(lookups: ImportLookups): ListSource[] {
  const names = (xs: { name: string }[]) =>
    Array.from(new Set(xs.map((x) => x.name))).sort((a, b) => a.localeCompare(b));
  return [
    { key: "purpose", values: PURPOSE_CHOICES.map((p) => p.label) },
    { key: "property_type", values: [...PROPERTY_TYPES] },
    { key: "owner", values: names(lookups.owners) },
    {
      key: "agent",
      values: lookups.agents
        .filter((a) => a.is_active)
        .map((a) => a.full_name)
        .sort((a, b) => a.localeCompare(b)),
    },
    { key: "country", values: names(lookups.countries.filter((c) => c.is_active)) },
    { key: "area", values: names(lookups.areas.filter((a) => a.is_active)) },
    { key: "place", values: names(lookups.places.filter((p) => p.is_active)) },
    { key: "development", values: names(lookups.developments) },
    { key: "developer", values: names(lookups.developers.filter((d) => d.is_active)) },
    { key: "currency", values: [...CURRENCY_CHOICES] },
    { key: "size_unit", values: [...SIZE_UNIT_CHOICES] },
    { key: "furnishing_status", values: FURNISHING_CHOICES.map((f) => f.value) },
    { key: "availability", values: AVAILABILITY_CHOICES.map((a) => a.label) },
  ];
}

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** The file as bytes, ready to download. exceljs is loaded here so it only costs anything when asked for. */
export async function buildPropertyImportTemplate(lookups: ImportLookups): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Q-Bay CRM";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Properties", { views: [{ state: "frozen", ySplit: 1 }] });
  const info = wb.addWorksheet("Instructions");
  const lists = wb.addWorksheet("Lists", { state: "hidden" });

  // Lists sheet: one column per list, so a drop-down points at a fixed range.
  const sources = templateLists(lookups);
  const listRange = new Map<ImportFieldKey, string>();
  sources.forEach((src, i) => {
    const col = columnLetter(i);
    lists.getCell(`${col}1`).value = src.key;
    src.values.forEach((v, r) => {
      lists.getCell(`${col}${r + 2}`).value = v;
    });
    // At least one row so an empty list is still a valid range.
    const last = Math.max(2, src.values.length + 1);
    listRange.set(src.key, `Lists!$${col}$2:$${col}$${last}`);
  });

  // Properties sheet.
  sheet.columns = IMPORT_FIELDS.map((f) => ({
    header: f.header + (f.required ? " *" : ""),
    key: f.key,
    width: f.width,
  }));
  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell, col) => {
    const field = IMPORT_FIELDS[col - 1];
    cell.font = { bold: true, color: { argb: field.required ? "FFFFFFFF" : MINT } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.required ? GREEN_MID : GREEN_DARK },
    };
    cell.alignment = { vertical: "middle" };
    cell.note = field.note;
  });

  IMPORT_FIELDS.forEach((f, i) => {
    const col = columnLetter(i);
    const ref = listRange.get(f.key);
    if (ref) {
      for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
        sheet.getCell(`${col}${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [ref],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: f.header,
          error: "Pick a value from the list. Other values are rejected when the file is imported.",
        };
      }
    } else if (["price", "size", "built_up_area"].includes(f.key)) {
      for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
        sheet.getCell(`${col}${r}`).dataValidation = {
          type: "decimal",
          operator: "greaterThanOrEqual",
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: f.header,
          error: "Enter a number, zero or more.",
        };
      }
    } else if (["bedrooms", "bathrooms", "parking_spaces"].includes(f.key)) {
      for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
        sheet.getCell(`${col}${r}`).dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: f.header,
          error: "Enter a whole number, zero or more.",
        };
      }
    }
  });

  // Instructions sheet.
  info.columns = [
    { header: "Column", key: "column", width: 24 },
    { header: "Required", key: "required", width: 12 },
    { header: "What to enter", key: "note", width: 90 },
  ];
  info.getRow(1).font = { bold: true };
  for (const f of IMPORT_FIELDS)
    info.addRow({ column: f.header, required: f.required ? "Yes" : "No", note: f.note });
  info.addRow({});
  info.addRow({
    column: "How it works",
    note: "Fill in the Properties sheet, then use Import from Excel on the Properties page in the CRM. Every row is checked first and nothing is saved until you confirm.",
  });
  info.addRow({
    column: "Approval",
    note: "Properties imported by a user without approval rights wait for an Administrator and stay off the website until approved.",
  });
  info.addRow({
    column: "Updating",
    note: "To change an existing property, fill in its Reference Code and only the columns that change. Blank cells are left as they are.",
  });
  info.addRow({
    column: "Lists",
    note: "Drop-downs show what exists in the CRM now. Download a fresh template to see newly added owners, agents or locations.",
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
