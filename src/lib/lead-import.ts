// Lead import: reading a CSV / Excel file, mapping its columns, checking every row against the
// current lead rules, planning what will be inserted / updated / skipped, and running that plan.
//
// Everything here is plain code with no database client, so it can be tested with real generated
// files. The one piece that talks to the database is a small adapter (LeadImportClient) that the
// app supplies. Rules the importer follows:
//   * Phone is required, like everywhere else a lead is created.
//   * Sale or Rent comes from the file when it says so, otherwise from the import default, and
//     the classification must fit it. Nothing is silently imported as Sale.
//   * A bad row never stops the good ones. Every problem names its spreadsheet row number.
//   * Row level security stays in charge: updates that the database refuses are reported as
//     failures instead of being counted as done.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { cleanSpreadsheetPhone, normalizePhone, phoneError, phoneMatchKey } from "./phone";
import {
  LEAD_CLASSIFICATION_LABELS,
  classificationsForIntent,
  defaultClassificationForIntent,
  type LeadIntent,
} from "./lead-model";

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

export type LeadImportFieldKey =
  | "full_name"
  | "phone"
  | "email"
  | "transaction_intent"
  | "classification"
  | "workflow"
  | "assigned_agent"
  | "lead_source"
  | "pipeline_stage"
  | "budget_min"
  | "budget_max"
  | "currency"
  | "nationality"
  | "preferred_language"
  | "preferred_locations"
  | "preferred_property_types"
  | "preferred_bedrooms"
  | "purchase_purpose"
  | "buying_timeline"
  | "financing_status"
  | "notes";

export type LeadImportField = {
  key: LeadImportFieldKey;
  label: string;
  required?: boolean;
  hint?: string;
  aliases: string[];
};

export const LEAD_IMPORT_FIELDS: LeadImportField[] = [
  {
    key: "full_name",
    label: "Full Name",
    required: true,
    aliases: [
      "full name",
      "name",
      "client name",
      "customer name",
      "customer",
      "lead name",
      "client",
      "contact name",
    ],
  },
  {
    key: "phone",
    label: "Phone",
    required: true,
    aliases: [
      "phone",
      "phone number",
      "phone no",
      "mobile",
      "mobile number",
      "mobile no",
      "telephone",
      "tel",
      "cell",
      "contact number",
      "contact",
      "whatsapp",
      "whatsapp number",
    ],
  },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address", "mail"] },
  {
    key: "transaction_intent",
    label: "Sale or Rent",
    hint: "Sale, Rent, Buyer, Renter, Tenant...",
    aliases: [
      "sale or rent",
      "sale/rent",
      "intent",
      "transaction",
      "transaction type",
      "deal type",
      "looking to",
      "interested in",
      "buy or rent",
      "request type",
      "service",
    ],
  },
  {
    key: "classification",
    label: "Classification",
    hint: "Buyer, Renter, Investor, Commercial, Property Owner",
    aliases: ["classification", "lead type", "client type", "category", "customer type"],
  },
  { key: "workflow", label: "Workflow", hint: "Sales or Telesales", aliases: ["workflow"] },
  {
    key: "assigned_agent",
    label: "Assigned Agent",
    hint: "Matched by name, email or code",
    aliases: [
      "assigned agent",
      "agent",
      "assigned to",
      "sales agent",
      "agent name",
      "consultant",
      "broker",
    ],
  },
  {
    key: "lead_source",
    label: "Lead Source",
    aliases: ["lead source", "source", "channel", "origin"],
  },
  {
    key: "pipeline_stage",
    label: "Pipeline Stage",
    aliases: ["pipeline stage", "stage", "lead status", "status"],
  },
  {
    key: "budget_min",
    label: "Budget Min",
    aliases: ["budget min", "min budget", "minimum budget", "budget from", "budget low"],
  },
  {
    key: "budget_max",
    label: "Budget Max",
    aliases: ["budget max", "max budget", "maximum budget", "budget to", "budget high", "budget"],
  },
  { key: "currency", label: "Currency", aliases: ["currency", "ccy"] },
  { key: "nationality", label: "Nationality", aliases: ["nationality", "citizenship"] },
  {
    key: "preferred_language",
    label: "Preferred Language",
    aliases: ["preferred language", "language", "lang"],
  },
  {
    key: "preferred_locations",
    label: "Preferred Locations",
    hint: "Comma separated",
    aliases: [
      "preferred locations",
      "preferred location",
      "locations",
      "location",
      "area",
      "areas",
      "preferred area",
      "community",
    ],
  },
  {
    key: "preferred_property_types",
    label: "Property Types",
    hint: "Comma separated",
    aliases: [
      "property types",
      "property type",
      "preferred property types",
      "type of property",
      "unit type",
    ],
  },
  {
    key: "preferred_bedrooms",
    label: "Bedrooms",
    hint: "Numbers, comma separated. Studio counts as 0",
    aliases: ["bedrooms", "bedroom", "beds", "no of bedrooms", "br", "bhk"],
  },
  { key: "purchase_purpose", label: "Purchase Purpose", aliases: ["purchase purpose", "purpose"] },
  {
    key: "buying_timeline",
    label: "Buying Timeline",
    aliases: ["buying timeline", "timeline", "timeframe", "time frame"],
  },
  {
    key: "financing_status",
    label: "Financing Status",
    aliases: ["financing status", "financing", "payment method", "finance"],
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "note", "comments", "comment", "remarks", "remark"],
  },
];

/** Column index in the file for each field the user has mapped. */
export type LeadColumnMapping = Partial<Record<LeadImportFieldKey, number | null>>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Guesses which column feeds which field. Exact header matches win; a header that merely
 * contains a longer alias is used only when the field is still unmapped. A column is never
 * used for two fields.
 */
export function autoMapColumns(headers: string[]): LeadColumnMapping {
  const map: LeadColumnMapping = {};
  const used = new Set<number>();
  const normHeaders = headers.map(norm);

  for (const f of LEAD_IMPORT_FIELDS) {
    const targets = new Set([norm(f.key), norm(f.label), ...f.aliases.map(norm)]);
    const idx = normHeaders.findIndex((h, i) => !used.has(i) && !!h && targets.has(h));
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(idx);
    }
  }
  for (const f of LEAD_IMPORT_FIELDS) {
    if (map[f.key] != null) continue;
    const longAliases = f.aliases.map(norm).filter((a) => a.length >= 5);
    const idx = normHeaders.findIndex(
      (h, i) => !used.has(i) && !!h && longAliases.some((a) => h.includes(a)),
    );
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(idx);
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Reading files                                                              */
/* -------------------------------------------------------------------------- */

export const SUPPORTED_IMPORT_EXTENSIONS = ["csv", "xlsx", "xls"] as const;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Thrown for anything wrong with the file itself. The message is safe to show to the user. */
export class ImportFileError extends Error {}

export type ParsedTable = {
  headers: string[];
  /** Data rows. `rowNumber` is the row number in the spreadsheet (the header row is above it). */
  rows: { rowNumber: number; values: string[] }[];
};

export type LoadedImportFile =
  | { kind: "csv"; table: ParsedTable }
  | { kind: "workbook"; sheetNames: string[]; workbook: XLSX.WorkBook };

function columnLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Turns rows of cells into a header plus data rows. The first row that has any content is the
 * header. Blank rows are dropped but the remaining rows keep their real spreadsheet numbers.
 */
export function matrixToTable(matrix: string[][], firstRowNumber = 1): ParsedTable {
  const isBlank = (r: string[]) => r.every((c) => String(c ?? "").trim() === "");
  const headerIdx = matrix.findIndex((r) => !isBlank(r));
  if (headerIdx < 0)
    throw new ImportFileError(
      "The file is empty. Add a header row and your leads, then try again.",
    );

  const width = Math.max(...matrix.map((r) => r.length));
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const raw = String(matrix[headerIdx][c] ?? "").trim();
    headers.push(raw || `Column ${columnLetter(c)}`);
  }

  const rows: ParsedTable["rows"] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    if (isBlank(matrix[i])) continue;
    const values = Array.from({ length: width }, (_, c) => String(matrix[i][c] ?? "").trim());
    rows.push({ rowNumber: firstRowNumber + i, values });
  }
  if (rows.length === 0) {
    throw new ImportFileError("No lead rows were found under the header row.");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `This file has ${rows.length.toLocaleString()} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time by splitting the file.`,
    );
  }
  return { headers, rows };
}

/** Builds the cell matrix of one worksheet with exact row numbers, preserving long numbers. */
function sheetToMatrix(sheet: XLSX.WorkSheet): { matrix: string[][]; firstRowNumber: number } {
  const ref = sheet["!ref"];
  if (!ref) return { matrix: [], firstRowNumber: 1 };
  const range = XLSX.utils.decode_range(ref);
  const matrix: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell) {
        row.push("");
        continue;
      }
      const shown = cell.w ?? (cell.v == null ? "" : String(cell.v));
      // A long number Excel displays as 9.74555E+10 is still the exact integer underneath.
      if (
        cell.t === "n" &&
        typeof cell.v === "number" &&
        /e\+/i.test(shown) &&
        Number.isSafeInteger(cell.v)
      ) {
        row.push(String(cell.v));
      } else {
        row.push(shown);
      }
    }
    matrix.push(row);
  }
  return { matrix, firstRowNumber: range.s.r + 1 };
}

export function sheetToTable(workbook: XLSX.WorkBook, sheetName: string): ParsedTable {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new ImportFileError(`The worksheet "${sheetName}" could not be found in this file.`);
  const { matrix, firstRowNumber } = sheetToMatrix(sheet);
  return matrixToTable(matrix, firstRowNumber);
}

function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Excel on Windows saves "CSV" in the local ANSI code page, Arabic on Arabic systems.
    return new TextDecoder("windows-1256").decode(buffer);
  }
}

type Signature = "zip" | "ole" | "text" | "binary";

function sniffSignature(buffer: ArrayBuffer): Signature {
  const b = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength));
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip"; // .xlsx is a zip package
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "ole"; // .xls, or an encrypted workbook
  for (const byte of b) if (byte === 0 || (byte < 9 && byte > 0)) return "binary";
  return "text";
}

/**
 * The spreadsheet reader is forgiving and will happily treat random bytes as text. Check the
 * file really is what its extension says, so a corrupt or renamed file gets a clear message
 * instead of a table of nonsense.
 */
function assertLooksLikeSpreadsheet(ext: string, buffer: ArrayBuffer): void {
  const sig = sniffSignature(buffer);
  if (ext === "xlsx" && (sig === "zip" || sig === "ole")) return;
  // Systems often export ".xls" that is really an HTML table or text, which the reader handles.
  if (ext === "xls" && sig !== "binary") return;
  if (ext === "xlsx" && sig === "text") {
    throw new ImportFileError(
      "This file has an .xlsx extension but is plain text, not an Excel workbook. If it is a CSV, rename it to .csv and import it again.",
    );
  }
  throw new ImportFileError(
    `This ${ext.toUpperCase()} file is not a valid Excel workbook. It may be corrupt or damaged. Open it in Excel, save it again as .xlsx or .csv, and retry.`,
  );
}

/**
 * Reads an uploaded file. CSV becomes a table straight away; Excel files become a workbook so
 * the user can pick the sheet. Every failure is an ImportFileError with a plain message.
 */
export function loadImportFile(fileName: string, buffer: ArrayBuffer): LoadedImportFile {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!(SUPPORTED_IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ImportFileError(
      `"${fileName}" is not a supported file type. Upload a CSV, XLSX or XLS file.`,
    );
  }
  if (buffer.byteLength === 0) throw new ImportFileError("The file is empty.");
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new ImportFileError(
      `The file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB. Split it into smaller files and import them one at a time.`,
    );
  }

  if (ext === "csv") {
    const text = decodeCsv(buffer).replace(/^\uFEFF/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    const matrix = (parsed.data as unknown[]).filter(Array.isArray) as string[][];
    if (matrix.length === 0) {
      throw new ImportFileError(parsed.errors[0]?.message ?? "The CSV file could not be read.");
    }
    return { kind: "csv", table: matrixToTable(matrix, 1) };
  }

  assertLooksLikeSpreadsheet(ext, buffer);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (e) {
    const detail = (e as Error).message ? ` (${(e as Error).message})` : "";
    throw new ImportFileError(
      `This ${ext.toUpperCase()} file could not be read${detail}. It may be corrupt or password protected. Open it in Excel, save it again as .xlsx or .csv, and retry.`,
    );
  }
  if (!workbook.SheetNames.length) {
    throw new ImportFileError("This workbook has no worksheets.");
  }
  return { kind: "workbook", sheetNames: workbook.SheetNames, workbook };
}

/* -------------------------------------------------------------------------- */
/* Normalising cell values                                                    */
/* -------------------------------------------------------------------------- */

// Letters and digits of any script, so Arabic names still compare as themselves.
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const SALE_WORDS = new Set([
  "sale",
  "sales",
  "sell",
  "selling",
  "buy",
  "buyer",
  "buyers",
  "buying",
  "purchase",
  "purchasing",
  "for sale",
  "to buy",
  "to purchase",
]);
const RENT_WORDS = new Set([
  "rent",
  "rental",
  "rentals",
  "renting",
  "renter",
  "renters",
  "tenant",
  "tenants",
  "lease",
  "leasing",
  "for rent",
  "to rent",
  "let",
  "to let",
]);

export type IntentCell =
  | { kind: "empty" }
  | { kind: "ok"; value: LeadIntent }
  | { kind: "unknown" };

/** Sale/Rent from free text. Only clear words are accepted; anything else is "unknown". */
export function normalizeIntent(raw: string): IntentCell {
  const w = words(raw);
  if (!w) return { kind: "empty" };
  if (SALE_WORDS.has(w)) return { kind: "ok", value: "sale" };
  if (RENT_WORDS.has(w)) return { kind: "ok", value: "rent" };
  return { kind: "unknown" };
}

const CLASSIFICATION_WORDS: Record<string, string> = {
  buyer: "buyer",
  buyers: "buyer",
  buy: "buyer",
  renter: "renter",
  renters: "renter",
  tenant: "renter",
  tenants: "renter",
  investor: "investor",
  investors: "investor",
  investment: "investor",
  commercial: "commercial",
  owner: "owner",
  owners: "owner",
  "property owner": "owner",
  landlord: "owner",
  seller: "owner",
};

export type ClassificationCell =
  | { kind: "empty" }
  | { kind: "ok"; value: string }
  | { kind: "unknown" };

export function normalizeClassification(raw: string): ClassificationCell {
  const w = words(raw);
  if (!w) return { kind: "empty" };
  const hit = CLASSIFICATION_WORDS[w];
  return hit ? { kind: "ok", value: hit } : { kind: "unknown" };
}

const classificationLabel = (c: string) => LEAD_CLASSIFICATION_LABELS[c] ?? c;

function parseAmount(raw: string): { value: number | null; bad: boolean } {
  const s = raw.trim();
  if (!s) return { value: null, bad: false };
  const cleaned = s
    .replace(/[,\s]/g, "")
    .replace(/^(qar|qr|usd|aed|eur|gbp|\$|€|£)/i, "")
    .replace(/(qar|qr|usd|aed|eur|gbp)$/i, "");
  const m = /^(\d+(?:\.\d+)?)([km])?$/i.exec(cleaned);
  if (!m) return { value: null, bad: true };
  const mult = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return { value: parseFloat(m[1]) * mult, bad: false };
}

const splitList = (s: string): string[] =>
  s
    .split(/[,;|\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function parseBedrooms(raw: string): { value: number[]; bad: boolean } {
  const tokens = raw
    .split(/[,;/|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { value: [], bad: false };
  const out: number[] = [];
  let bad = false;
  for (const t of tokens) {
    if (/^studio$/i.test(t)) out.push(0);
    else if (/^\d+\+?$/.test(t)) out.push(parseInt(t, 10));
    else bad = true;
  }
  return { value: Array.from(new Set(out)), bad };
}

function normalizeCurrency(raw: string): { value: string | null; bad: boolean } {
  const s = raw.trim().toUpperCase();
  if (!s) return { value: null, bad: false };
  if (/^[A-Z]{3}$/.test(s)) return { value: s, bad: false };
  if (["QR", "QATARI RIYAL", "RIYAL", "QATAR"].includes(s)) return { value: "QAR", bad: false };
  return { value: null, bad: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

export type TeamMemberRef = {
  id: string;
  full_name: string;
  email?: string | null;
  code?: string | null;
};

/** A lead the importing user can already see, used to spot duplicates. */
export type ExistingLeadRef = { id: string; phone: string | null; email: string | null };

export type DuplicateAction = "skip" | "update" | "new";

export type LeadImportOptions = {
  defaultIntent: LeadIntent;
  duplicateAction: DuplicateAction;
  /** Written to leads.lead_source when the file has no source column, or the cell is empty. */
  defaultLeadSource: string;
  /** Who gets the lead when the file does not name an agent. null leaves it unassigned. */
  defaultAgentId: string | null;
  /** False for anyone without leads.assign: the agent column is ignored and leads go to them. */
  canAssignOthers: boolean;
  currentMemberId: string | null;
  teamMembers: TeamMemberRef[];
  stages: { key: string; label: string }[];
  existing: ExistingLeadRef[];
  /** Overridable so tests get stable ids. */
  newId?: () => string;
};

export type PlannedStatus = "insert" | "update" | "skip" | "invalid";

export type PlannedRow = {
  rowNumber: number;
  status: PlannedStatus;
  /** Why a row is invalid (all problems) or why it is skipped. */
  reasons: string[];
  warnings: string[];
  duplicate: "none" | "existing" | "in_file";
  duplicateOfRow?: number;
  targetId?: string;
  payload?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  preview: {
    name: string;
    phone: string;
    email: string;
    intent: LeadIntent | null;
    classification: string | null;
  };
};

export type ImportCounts = {
  total: number;
  valid: number;
  invalid: number;
  duplicatesExisting: number;
  duplicatesInFile: number;
  insert: number;
  update: number;
  skip: number;
  withWarnings: number;
};

export type ImportPlan = { rows: PlannedRow[]; counts: ImportCounts; notes: string[] };

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

const STAGE_ALIASES: Record<string, string> = {
  new: "new_lead",
  "new lead": "new_lead",
  "closed won": "won",
  "closed lost": "lost",
};

function resolveStage(raw: string, stages: { key: string; label: string }[]): string | null {
  const w = words(raw);
  if (!w) return null;
  const direct = stages.find((s) => words(s.key) === w || words(s.label) === w);
  if (direct) return direct.key;
  const alias = STAGE_ALIASES[w];
  return alias && stages.some((s) => s.key === alias) ? alias : null;
}

function resolveAgent(raw: string, members: TeamMemberRef[]): { id: string } | { error: string } {
  const w = words(raw);
  if (!w) return { error: `agent "${raw}" was not found in the team` };
  const matches = members.filter(
    (m) =>
      words(m.full_name) === w ||
      (!!m.email && m.email.trim().toLowerCase() === raw.trim().toLowerCase()) ||
      (!!m.code && m.code.trim().toLowerCase() === raw.trim().toLowerCase()),
  );
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length > 1) return { error: `agent "${raw}" matches more than one team member` };
  return { error: `agent "${raw}" was not found in the team` };
}

export function planLeadImport(
  table: ParsedTable,
  mapping: LeadColumnMapping,
  options: LeadImportOptions,
): ImportPlan {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const notes: string[] = [];
  if (!options.canAssignOthers && mapping.assigned_agent != null) {
    notes.push(
      "You can not assign leads to other agents, so the agent column is ignored and every lead is assigned to you.",
    );
  }

  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const e of options.existing) {
    const pk = phoneMatchKey(e.phone);
    if (pk && !byPhone.has(pk)) byPhone.set(pk, e.id);
    const ek = (e.email ?? "").trim().toLowerCase();
    if (ek && !byEmail.has(ek)) byEmail.set(ek, e.id);
  }
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  const cellOf = (values: string[], key: LeadImportFieldKey): string => {
    const idx = mapping[key];
    return idx == null ? "" : (values[idx] ?? "").trim();
  };
  const mapped = (key: LeadImportFieldKey) => mapping[key] != null;

  const rows: PlannedRow[] = table.rows.map(({ rowNumber, values }): PlannedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = cellOf(values, "full_name");
    if (!name) errors.push("full name is required");

    // Phone
    const cleaned = cleanSpreadsheetPhone(cellOf(values, "phone"));
    let phone = "";
    if (cleaned.problem) {
      errors.push(cleaned.problem);
    } else {
      const problem = phoneError(cleaned.value);
      if (problem) errors.push(lowerFirst(problem));
      else phone = normalizePhone(cleaned.value);
    }

    // Email (optional; a broken one is dropped, not fatal)
    let email = cellOf(values, "email");
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`email "${email}" is not valid and was ignored`);
      email = "";
    }

    // Sale or Rent, then classification that must fit it
    const intentCell = normalizeIntent(cellOf(values, "transaction_intent"));
    const classCell = normalizeClassification(cellOf(values, "classification"));
    let intent: LeadIntent | null = null;
    if (intentCell.kind === "ok") intent = intentCell.value;
    else if (intentCell.kind === "unknown") {
      errors.push(
        `Sale or Rent value "${cellOf(values, "transaction_intent")}" is not recognised (use Sale or Rent)`,
      );
    } else if (classCell.kind === "ok" && classCell.value === "buyer") intent = "sale";
    else if (classCell.kind === "ok" && classCell.value === "renter") intent = "rent";
    else intent = options.defaultIntent;

    let classification: string | null = null;
    if (classCell.kind === "unknown") {
      errors.push(`classification "${cellOf(values, "classification")}" is not recognised`);
    } else if (intent) {
      if (classCell.kind === "ok") {
        if (classificationsForIntent(intent).includes(classCell.value))
          classification = classCell.value;
        else {
          errors.push(
            `classification ${classificationLabel(classCell.value)} does not fit a ${intent === "rent" ? "Rent" : "Sale"} lead`,
          );
        }
      } else {
        classification = defaultClassificationForIntent(intent);
      }
    }

    // Workflow
    const workflowRaw = cellOf(values, "workflow");
    let workflow: "sales" | "telesales" = "sales";
    if (workflowRaw) {
      if (/tele/i.test(workflowRaw)) workflow = "telesales";
      else if (!/^sales?$/i.test(workflowRaw)) {
        warnings.push(`workflow "${workflowRaw}" is not recognised, Sales was used`);
      }
    }

    // Numbers, lists and simple text
    const bMin = parseAmount(cellOf(values, "budget_min"));
    if (bMin.bad)
      warnings.push(`budget min "${cellOf(values, "budget_min")}" is not a number and was ignored`);
    const bMax = parseAmount(cellOf(values, "budget_max"));
    if (bMax.bad)
      warnings.push(`budget max "${cellOf(values, "budget_max")}" is not a number and was ignored`);
    const cur = normalizeCurrency(cellOf(values, "currency"));
    if (cur.bad)
      warnings.push(`currency "${cellOf(values, "currency")}" is not recognised, QAR was used`);
    const beds = parseBedrooms(cellOf(values, "preferred_bedrooms"));
    if (beds.bad)
      warnings.push(
        `some bedroom values in "${cellOf(values, "preferred_bedrooms")}" were ignored`,
      );
    const locations = splitList(cellOf(values, "preferred_locations"));
    const types = splitList(cellOf(values, "preferred_property_types"));

    // Pipeline stage
    const stageRaw = cellOf(values, "pipeline_stage");
    const stage: string | null = resolveStage(stageRaw, options.stages);
    if (stageRaw && !stage)
      warnings.push(`pipeline stage "${stageRaw}" is not recognised, New Lead was used`);

    // Agent
    let agentId: string | null = options.defaultAgentId;
    let agentFromFile = false;
    if (!options.canAssignOthers) {
      agentId = options.currentMemberId;
    } else {
      const agentRaw = cellOf(values, "assigned_agent");
      if (agentRaw) {
        const found = resolveAgent(agentRaw, options.teamMembers);
        if ("error" in found) errors.push(found.error);
        else {
          agentId = found.id;
          agentFromFile = true;
        }
      }
    }

    const preview = { name, phone, email, intent, classification };
    if (errors.length > 0) {
      return {
        rowNumber,
        status: "invalid",
        reasons: errors,
        warnings,
        duplicate: "none",
        preview,
      };
    }

    // Duplicates: inside this file first, then against leads the user can already see.
    const pk = phoneMatchKey(phone);
    const ek = email.toLowerCase();
    let duplicate: PlannedRow["duplicate"] = "none";
    let duplicateOfRow: number | undefined;
    let targetId: string | undefined;
    const seenAtPhone = pk ? seenPhone.get(pk) : undefined;
    const seenAtEmail = ek ? seenEmail.get(ek) : undefined;
    const existingByPhone = pk ? byPhone.get(pk) : undefined;
    const existingByEmail = ek ? byEmail.get(ek) : undefined;
    if (seenAtPhone != null || seenAtEmail != null) {
      duplicate = "in_file";
      duplicateOfRow = seenAtPhone ?? seenAtEmail;
    } else if (existingByPhone || existingByEmail) {
      duplicate = "existing";
      targetId = existingByPhone ?? existingByEmail;
    }
    if (duplicate !== "in_file") {
      if (pk) seenPhone.set(pk, rowNumber);
      if (ek) seenEmail.set(ek, rowNumber);
    }

    const base = { rowNumber, warnings, duplicate, duplicateOfRow, preview };

    if (duplicate === "in_file" && options.duplicateAction !== "new") {
      return {
        ...base,
        status: "skip",
        reasons: [`duplicate of row ${duplicateOfRow} in this file, only the first is imported`],
      };
    }
    if (duplicate === "existing" && options.duplicateAction === "skip") {
      return {
        ...base,
        status: "skip",
        reasons: ["already in the CRM (matched by phone or email)"],
        targetId,
      };
    }

    if (duplicate === "existing" && options.duplicateAction === "update") {
      // Fill in what the file provides. Never blanks, never defaults, never reassigns silently.
      const patch: Record<string, unknown> = {};
      if (phone) patch.phone = phone;
      if (name) patch.full_name = name;
      if (email) patch.email = email;
      if (mapped("transaction_intent") && intentCell.kind === "ok" && intent)
        patch.transaction_intent = intent;
      if (mapped("classification") && classCell.kind === "ok" && classification)
        patch.classification = classification;
      if (mapped("workflow") && workflowRaw) patch.workflow = workflow;
      if (bMin.value != null) patch.budget_min = bMin.value;
      if (bMax.value != null) patch.budget_max = bMax.value;
      if (cur.value) patch.currency = cur.value;
      const text = (k: LeadImportFieldKey) => cellOf(values, k);
      if (text("nationality")) patch.nationality = text("nationality");
      if (text("preferred_language")) patch.preferred_language = text("preferred_language");
      if (locations.length) patch.preferred_locations = locations;
      if (types.length) patch.preferred_property_types = types;
      if (beds.value.length) patch.preferred_bedrooms = beds.value;
      if (text("purchase_purpose")) patch.purchase_purpose = text("purchase_purpose");
      if (text("buying_timeline")) patch.buying_timeline = text("buying_timeline");
      if (text("financing_status")) patch.financing_status = text("financing_status");
      if (text("lead_source")) patch.lead_source = text("lead_source");
      if (text("notes")) patch.notes = text("notes");
      if (stage && mapped("pipeline_stage")) patch.pipeline_stage = stage;
      if (agentFromFile && agentId) patch.assigned_agent_id = agentId;
      return { ...base, status: "update", reasons: [], targetId, patch };
    }

    const payload: Record<string, unknown> = {
      id: newId(),
      full_name: name,
      phone,
      email: email || null,
      transaction_intent: intent,
      classification,
      workflow,
      budget_min: bMin.value,
      budget_max: bMax.value,
      currency: cur.value ?? "QAR",
      nationality: cellOf(values, "nationality") || null,
      preferred_language: cellOf(values, "preferred_language") || null,
      preferred_locations: locations.length ? locations : null,
      preferred_property_types: types.length ? types : null,
      preferred_bedrooms: beds.value.length ? beds.value : null,
      purchase_purpose: cellOf(values, "purchase_purpose") || null,
      buying_timeline: cellOf(values, "buying_timeline") || null,
      financing_status: cellOf(values, "financing_status") || null,
      lead_source: cellOf(values, "lead_source") || options.defaultLeadSource || null,
      pipeline_stage: stage ?? "new_lead",
      assigned_agent_id: agentId,
      notes: cellOf(values, "notes") || null,
    };
    return { ...base, status: "insert", reasons: [], targetId, payload };
  });

  const counts: ImportCounts = {
    total: rows.length,
    valid: rows.filter((r) => r.status !== "invalid").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    duplicatesExisting: rows.filter((r) => r.duplicate === "existing").length,
    duplicatesInFile: rows.filter((r) => r.duplicate === "in_file").length,
    insert: rows.filter((r) => r.status === "insert").length,
    update: rows.filter((r) => r.status === "update").length,
    skip: rows.filter((r) => r.status === "skip").length,
    withWarnings: rows.filter((r) => r.warnings.length > 0).length,
  };
  // An update with nothing to change is a skip, not a silent no-op.
  for (const r of rows) {
    if (r.status === "update" && r.patch && Object.keys(r.patch).length === 0) {
      r.status = "skip";
      r.reasons = ["nothing to update"];
      counts.update--;
      counts.skip++;
    }
  }
  return { rows, counts, notes };
}

/** Everything that stops the plan from being run at all. Empty means it can be imported. */
export function planBlockers(mapping: LeadColumnMapping): string[] {
  const out: string[] = [];
  if (mapping.full_name == null) out.push("Choose the column that holds the Full Name.");
  if (mapping.phone == null)
    out.push("Choose the column that holds the Phone number. Phone is required for every lead.");
  return out;
}

/* -------------------------------------------------------------------------- */
/* Running the plan                                                           */
/* -------------------------------------------------------------------------- */

export type DbErrorLike = { code?: string | null; message: string };

/** The only database operations the importer needs. The app supplies a Supabase-backed one. */
export type LeadImportClient = {
  /** Insert without asking for the rows back: reading them back is subject to row visibility. */
  insertLeads: (rows: Record<string, unknown>[]) => Promise<DbErrorLike | null>;
  /** `updated` is false when the database let the statement through but changed no row. */
  updateLead: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<{ error: DbErrorLike | null; updated: boolean }>;
  insertHistory: (
    rows: { lead_id: string; previous_stage: string | null; new_stage: string }[],
  ) => Promise<void>;
};

export type LeadImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
  failed: number;
  failures: { rowNumber: number; message: string }[];
  importedLeadIds: string[];
};

export function friendlyDbError(err: DbErrorLike): string {
  const msg = err.message ?? "";
  if (err.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "you are not allowed to add or change this lead";
  }
  if (/phone number is required/i.test(msg)) return "phone number is required";
  if (/phone number cannot be removed/i.test(msg)) return "the phone number cannot be blanked";
  if (err.code === "23503") return "a linked record (agent, team or development) no longer exists";
  if (err.code === "23514") return `a value is not allowed (${msg})`;
  return msg || "the database rejected this row";
}

export async function executeLeadImport(
  plan: ImportPlan,
  client: LeadImportClient,
  opts: { chunkSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<LeadImportResult> {
  const chunkSize = opts.chunkSize ?? 50;
  const result: LeadImportResult = {
    imported: 0,
    updated: 0,
    skipped: plan.counts.skip,
    invalid: plan.counts.invalid,
    failed: 0,
    failures: [],
    importedLeadIds: [],
  };
  const inserts = plan.rows.filter((r) => r.status === "insert" && r.payload);
  const updates = plan.rows.filter((r) => r.status === "update" && r.patch && r.targetId);
  const total = inserts.length + updates.length;
  let done = 0;
  const tick = (n: number) => {
    done += n;
    opts.onProgress?.(done, total);
  };

  const history: { lead_id: string; previous_stage: string | null; new_stage: string }[] = [];
  const recordInserted = (row: PlannedRow) => {
    const id = row.payload!.id as string;
    result.imported++;
    result.importedLeadIds.push(id);
    history.push({
      lead_id: id,
      previous_stage: null,
      new_stage: String(row.payload!.pipeline_stage),
    });
  };

  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const error = await client.insertLeads(chunk.map((r) => r.payload!));
    if (!error) {
      chunk.forEach(recordInserted);
      tick(chunk.length);
      continue;
    }
    // One bad row must not sink its neighbours: retry the chunk row by row to find it.
    for (const row of chunk) {
      const rowError = await client.insertLeads([row.payload!]);
      if (rowError) {
        result.failed++;
        result.failures.push({ rowNumber: row.rowNumber, message: friendlyDbError(rowError) });
      } else {
        recordInserted(row);
      }
      tick(1);
    }
  }

  for (const row of updates) {
    const { error, updated } = await client.updateLead(row.targetId!, row.patch!);
    if (error) {
      result.failed++;
      result.failures.push({ rowNumber: row.rowNumber, message: friendlyDbError(error) });
    } else if (!updated) {
      result.failed++;
      result.failures.push({
        rowNumber: row.rowNumber,
        message: "not updated: you are not allowed to edit the existing lead this row matches",
      });
    } else {
      result.updated++;
    }
    tick(1);
  }

  if (history.length > 0) {
    try {
      await client.insertHistory(history);
    } catch {
      // The stage history is a convenience. The leads themselves are already saved.
    }
  }
  return result;
}

/** Rows that need attention after a run, for the on-screen list and the downloadable report. */
export function collectIssues(
  plan: ImportPlan,
  result?: LeadImportResult,
): { row: number; outcome: string; detail: string }[] {
  const out: { row: number; outcome: string; detail: string }[] = [];
  for (const r of plan.rows) {
    if (r.status === "invalid")
      out.push({ row: r.rowNumber, outcome: "Invalid", detail: r.reasons.join("; ") });
    else if (r.status === "skip")
      out.push({ row: r.rowNumber, outcome: "Skipped", detail: r.reasons.join("; ") });
    for (const w of r.warnings) out.push({ row: r.rowNumber, outcome: "Warning", detail: w });
  }
  for (const f of result?.failures ?? [])
    out.push({ row: f.rowNumber, outcome: "Failed", detail: f.message });
  return out.sort((a, b) => a.row - b.row);
}
