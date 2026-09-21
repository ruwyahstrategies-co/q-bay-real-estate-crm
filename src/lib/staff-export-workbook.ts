import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

/** Columns that must never end up in an export, even if a table gains one later. */
const SECRET_KEY = /(password|passwd|token|secret|api[_-]?key|credential|service[_-]?role|authorization)/i;

const SHEETS: { key: string; name: string }[] = [
  { key: "leads", name: "Leads" },
  { key: "properties", name: "Properties" },
  { key: "developments", name: "Developments" },
  { key: "owners", name: "Owners" },
  { key: "tasks", name: "Tasks" },
  { key: "viewings", name: "Viewings" },
  { key: "offers", name: "Offers" },
  { key: "interactions", name: "Interactions" },
  { key: "lead_notes", name: "Lead Notes" },
  { key: "transactions", name: "Transactions" },
  { key: "owner_contracts", name: "Owner Contracts" },
  { key: "property_shares", name: "Property Shares" },
  { key: "marketing_requests", name: "Marketing Requests" },
];

function cell(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number | boolean;
}

function clean(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = cell(v);
  }
  return out;
}

function safeFilePart(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "staff";
}

/** Builds the multi-sheet workbook from an export_team_member_data payload. */
export function buildStaffWorkbook(
  payload: Record<string, unknown>,
  memberName: string,
  exportedBy: string,
): { wb: XLSX.WorkBook; records: number } {
  const wb = XLSX.utils.book_new();
  let records = 0;

  const profile = clean((payload.profile ?? {}) as Row);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(Object.entries(profile).map(([field, value]) => ({ Field: field, Value: value }))),
    "User Profile",
  );

  for (const { key, name } of SHEETS) {
    const rows = ((payload[key] as Row[] | undefined) ?? []).map(clean);
    records += rows.length;
    const ws = rows.length
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["No records"]]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Export of", memberName],
      ["Exported by", exportedBy],
      ["Exported at", new Date().toISOString()],
      ["Records", records],
      [
        "Note",
        "Login credentials, tokens and API keys are never included. Owner phone and ID number appear only where the exporting administrator is entitled to see them.",
      ],
    ]),
    "Export Info",
  );
  return { wb, records };
}

export function staffExportFilename(memberName: string): string {
  return `staff-export-${safeFilePart(memberName)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
