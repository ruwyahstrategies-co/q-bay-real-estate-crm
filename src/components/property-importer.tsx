import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { SelectField } from "./select-field";
import { sb } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { propertyKeys } from "@/hooks/use-properties";
import { usePermissions } from "@/hooks/use-auth";
import { OWNER_COLUMNS } from "@/lib/owner-privacy";
import {
  IMPORT_FIELDS,
  autoMatchColumns,
  importNorm,
  validatePropertyRow,
  type ImportFieldKey,
  type ImportLookups,
} from "@/lib/property-import";
import { buildPropertyImportTemplate } from "@/lib/property-import-template";
import { downloadBytes } from "@/lib/download";

// Bulk property import. A file is read, every row is checked against what exists in the CRM (owners, agents,
// locations, developments, approved developers), and only then does the person confirm. The database still
// enforces permissions and approval routing on every insert: a user without approval rights creates pending
// properties that stay off the website until an Administrator approves them.

type Row = Record<string, string>;
type Mapping = Partial<Record<ImportFieldKey, string>>;

type Checked = {
  line: number;
  title: string;
  kind: "new" | "update" | "skip";
  payload: Record<string, unknown>;
  errors: string[];
  existingId?: string;
};

type Summary = {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/** The slice of the query builder fetchAll needs: a couple of filters, then a row range. */
type PageableQuery = {
  neq(column: string, value: string): PageableQuery;
  eq(column: string, value: string): PageableQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: Error | null }>;
};

/** Reads every row of a table, past the API's default page size. */
async function fetchAll<T>(
  table: string,
  columns: string,
  filter?: (q: PageableQuery) => PageableQuery,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table as never).select(columns as never) as unknown as PageableQuery;
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadImportLookups(): Promise<ImportLookups> {
  const [countries, areas, places, developments, owners, agents, developers] = await Promise.all([
    fetchAll<ImportLookups["countries"][number]>("countries", "id, name, is_active"),
    fetchAll<ImportLookups["areas"][number]>("areas", "id, name, country_id, is_active"),
    fetchAll<ImportLookups["places"][number]>("places", "id, name, area_id, is_active"),
    fetchAll<ImportLookups["developments"][number]>("developments", "id, name"),
    fetchAll<ImportLookups["owners"][number]>("owners", OWNER_COLUMNS, (q) =>
      q.neq("status", "archived"),
    ),
    fetchAll<ImportLookups["agents"][number]>("team_members", "id, full_name, email, is_active"),
    fetchAll<ImportLookups["developers"][number]>(
      "master_data_values",
      "id, name, is_active",
      (q) => q.eq("kind", "developer"),
    ),
  ]);
  return { countries, areas, places, developments, owners, agents, developers };
}

export function PropertyImporter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"file" | "sheet" | "map" | "review" | "result">("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "new">("update");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Checked[]>([]);
  const workbook = useRef<XLSX.WorkBook | null>(null);
  const { can } = usePermissions();
  const [summary, setSummary] = useState<Summary | null>(null);

  function reset() {
    setStep("file");
    setFile(null);
    setSheets([]);
    setSelectedSheet("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setChecked([]);
    setSummary(null);
    workbook.current = null;
  }
  useEffect(() => {
    if (open) reset();
  }, [open]);

  function handleClose() {
    if (busy) return;
    reset();
    onOpenChange(false);
  }

  async function downloadTemplate() {
    setBusy(true);
    try {
      const lookups = await loadImportLookups();
      const bytes = await buildPropertyImportTemplate(lookups);
      downloadBytes(
        bytes,
        "qbay-property-import-template.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      toast.success("Template downloaded. Fill in the Properties sheet, then upload it here.");
    } catch (e) {
      toast.error((e as Error).message || "Could not build the template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelected(f: File) {
    setFile(f);
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse<Row>(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const hs = results.meta.fields ?? [];
          setHeaders(hs);
          setRows(results.data);
          setMapping(autoMatchColumns(hs));
          setStep("map");
        },
      });
    } else if (ext === "xlsx") {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      workbook.current = wb;
      // The template's own sheet is picked for you; any other workbook asks which sheet to read.
      const names = wb.SheetNames.filter(
        (n) => importNorm(n) !== "instructions" && importNorm(n) !== "lists",
      );
      setSheets(names);
      setSelectedSheet(names.find((n) => importNorm(n) === "properties") ?? names[0] ?? "");
      setStep("sheet");
    } else {
      toast.error("Upload a .xlsx or .csv file.");
    }
  }

  function loadSheet() {
    const wb = workbook.current;
    if (!wb || !selectedSheet) return;
    const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[selectedSheet], {
      defval: "",
      raw: false,
    });
    const hs = json[0] ? Object.keys(json[0]) : [];
    setHeaders(hs);
    setRows(json);
    setMapping(autoMatchColumns(hs));
    setStep("map");
  }

  const present = new Set(
    (Object.entries(mapping) as [ImportFieldKey, string | undefined][])
      .filter(([, col]) => !!col)
      .map(([k]) => k),
  );

  /** Checks every row against the CRM's current data. Nothing is written. */
  async function reviewRows() {
    setBusy(true);
    try {
      const lookups = await loadImportLookups();
      const existing = await fetchAll<{ id: string; reference_code: string | null }>(
        "properties",
        "id, reference_code",
      );
      const byRef = new Map<string, string>();
      for (const e of existing)
        if (e.reference_code) byRef.set(e.reference_code.toLowerCase(), e.id);

      const out: Checked[] = [];
      rows.forEach((row, i) => {
        const values: Partial<Record<ImportFieldKey, string>> = {};
        for (const [key, col] of Object.entries(mapping) as [ImportFieldKey, string][]) {
          if (col) values[key] = String(row[col] ?? "");
        }
        // A completely empty line (common at the bottom of a template) is not a property.
        if (Object.values(values).every((v) => !String(v).trim())) return;

        const refCode = String(values.reference_code ?? "").trim();
        const existingId = refCode ? byRef.get(refCode.toLowerCase()) : undefined;
        const title = String(values.title ?? "").trim() || refCode || "(no title)";
        const line = i + 2;
        if (existingId && duplicateAction === "skip") {
          out.push({ line, title, kind: "skip", payload: {}, errors: [], existingId });
          return;
        }
        const isUpdate = !!existingId && duplicateAction === "update";
        const { payload, errors } = validatePropertyRow(values, present, lookups, isUpdate);
        // References are issued by the CRM from the owner and agent. A typed one is never used for a new property.
        out.push({
          line,
          title,
          kind: isUpdate ? "update" : "new",
          payload,
          errors,
          existingId: isUpdate ? existingId : undefined,
        });
      });
      if (out.length === 0) {
        toast.error("The file has no property rows to import.");
        return;
      }
      setChecked(out);
      setStep("review");
    } catch (e) {
      toast.error((e as Error).message || "Could not check the file.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    const skipped = checked.filter((c) => c.kind === "skip").length;
    const ready = checked.filter((c) => c.kind !== "skip" && c.errors.length === 0);
    failed += checked.filter((c) => c.kind !== "skip" && c.errors.length > 0).length;

    const inserts = ready.filter((c) => c.kind === "new");
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      const { data, error } = await sb
        .from("properties")
        .insert(chunk.map((c) => c.payload) as never[])
        .select("id");
      if (!error) {
        imported += data?.length ?? 0;
        continue;
      }
      // One rejected row must not hide the others: retry the chunk one row at a time.
      for (const c of chunk) {
        const one = await sb
          .from("properties")
          .insert(c.payload as never)
          .select("id");
        if (one.error) {
          failed++;
          errors.push(`Row ${c.line} "${c.title}": ${one.error.message}`);
        } else imported++;
      }
    }
    for (const c of ready.filter((r) => r.kind === "update")) {
      const { error } = await sb
        .from("properties")
        .update(c.payload as never)
        .eq("id", c.existingId!);
      if (error) {
        failed++;
        errors.push(`Row ${c.line} "${c.title}": ${error.message}`);
      } else updated++;
    }

    setSummary({
      total: checked.length,
      imported,
      updated,
      skipped,
      failed,
      errors: errors.slice(0, 20),
    });
    setStep("result");
    setBusy(false);
    qc.invalidateQueries({ queryKey: propertyKeys.all });
  }

  const problems = checked.filter((c) => c.kind !== "skip" && c.errors.length > 0);
  const readyCount = checked.filter((c) => c.kind !== "skip" && c.errors.length === 0).length;

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      widthClassName="max-w-3xl"
      ariaLabel="Import properties"
    >
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
          <h3 className="text-base font-semibold">Import Properties</h3>
          <button
            onClick={handleClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {step === "file" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium">1. Start from the template</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The Excel template has drop-down lists for purpose, type, owner, agent, location,
                  development and more, so the file matches what is already in the CRM.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={downloadTemplate}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}{" "}
                  Download Excel template
                </Button>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
                <p className="text-sm font-medium">2. Upload the filled file</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  An .xlsx or .csv file. Every row is checked before anything is saved.
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  id="property-importer-file"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                />
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => document.getElementById("property-importer-file")?.click()}
                >
                  Choose file
                </Button>
              </div>
            </div>
          )}
          {step === "sheet" && (
            <div className="space-y-3">
              <p className="text-sm">
                Select the worksheet to import from <strong>{file?.name}</strong>:
              </p>
              <SelectField
                value={selectedSheet}
                onChange={(v) => setSelectedSheet(v ?? "")}
                options={sheets.map((s) => ({ value: s, label: s }))}
                allowClear={false}
                className="h-10 w-full text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>
                  Back
                </Button>
                <Button size="sm" onClick={loadSheet}>
                  Continue
                </Button>
              </div>
            </div>
          )}
          {step === "map" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Columns are matched by name. Check the matches below. Required for a new property:
                Title, Purpose, Property Type, Owner and Assigned Agent.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {f.header}
                      {f.required ? " *" : ""}
                    </span>
                    <SelectField
                      value={mapping[f.key] ?? null}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v ?? undefined }))}
                      options={headers.map((h) => ({ value: h, label: h }))}
                      emptyLabel="Skip"
                    />
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-medium">When the Reference Code already exists</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {(["skip", "update", "new"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={duplicateAction === opt}
                        onChange={() => setDuplicateAction(opt)}
                      />
                      <span>
                        {opt === "skip"
                          ? "Skip it"
                          : opt === "update"
                            ? "Update the existing property"
                            : "Import as a new property"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{rows.length} rows detected.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>
                  Back
                </Button>
                <Button size="sm" onClick={reviewRows} disabled={busy || !mapping.title}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
                  {busy ? "Checking..." : "Check rows"}
                </Button>
              </div>
            </div>
          )}
          {step === "review" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Rows" value={checked.length} />
                <Stat label="Ready" value={readyCount} />
                <Stat label="Need fixing" value={problems.length} />
                <Stat label="Skipped" value={checked.filter((c) => c.kind === "skip").length} />
              </div>
              {problems.length > 0 && (
                <div className="rounded-xl border border-border bg-background p-3 text-xs">
                  <p className="font-medium">
                    These rows will not be imported until fixed in the file
                  </p>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-muted-foreground">
                    {problems.slice(0, 50).map((p) => (
                      <li key={p.line}>
                        <span className="font-medium text-foreground">
                          Row {p.line}, {p.title}
                        </span>
                        <ul className="ml-4 list-disc">
                          {p.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  {problems.length > 50 && (
                    <p className="mt-2 text-muted-foreground">
                      And {problems.length - 50} more rows with problems.
                    </p>
                  )}
                </div>
              )}
              {!can("properties", "approve") && readyCount > 0 && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  These properties will be sent to an Administrator for approval and stay off the
                  public website until approved.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("map")} disabled={busy}>
                  Back
                </Button>
                <Button size="sm" onClick={runImport} disabled={busy || readyCount === 0}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
                  {busy
                    ? "Importing..."
                    : `Import ${readyCount} ready ${readyCount === 1 ? "row" : "rows"}`}
                </Button>
              </div>
            </div>
          )}
          {step === "result" && summary && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Import complete</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Total rows" value={summary.total} />
                <Stat label="Imported" value={summary.imported} />
                <Stat label="Updated" value={summary.updated} />
                <Stat label="Skipped" value={summary.skipped} />
                <Stat label="Failed" value={summary.failed} />
              </div>
              {!can("properties", "approve") && (summary.imported > 0 || summary.updated > 0) && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Imported properties are sent to an Administrator for approval and stay off the
                  public website until approved. Changes to the price, currency, purpose, owner,
                  development or type of an approved property are reviewed again before it returns
                  to the website.
                </p>
              )}
              {summary.errors.length > 0 && (
                <details className="rounded-lg border border-border bg-background p-3 text-xs" open>
                  <summary className="cursor-pointer font-medium">
                    Errors ({summary.errors.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {summary.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Import another
                </Button>
                <Button size="sm" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
