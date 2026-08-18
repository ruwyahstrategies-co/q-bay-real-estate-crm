import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { cn } from "@/lib/utils";
import { sb, PIPELINE_STAGES } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { leadsKeys } from "@/hooks/use-leads";

type Row = Record<string, string>;

const LEAD_FIELDS = [
  { key: "full_name", label: "Full name *" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "nationality", label: "Nationality" },
  { key: "preferred_language", label: "Preferred language" },
  { key: "budget_min", label: "Budget min" },
  { key: "budget_max", label: "Budget max" },
  { key: "currency", label: "Currency" },
  { key: "preferred_locations", label: "Preferred locations (comma sep.)" },
  { key: "preferred_property_types", label: "Property types (comma sep.)" },
  { key: "preferred_bedrooms", label: "Bedrooms (comma sep. ints)" },
  { key: "purchase_purpose", label: "Purchase purpose" },
  { key: "buying_timeline", label: "Buying timeline" },
  { key: "financing_status", label: "Financing status" },
  { key: "lead_source", label: "Lead source" },
  { key: "pipeline_stage", label: "Pipeline stage" },
  { key: "notes", label: "Notes" },
] as const;

type FieldKey = (typeof LEAD_FIELDS)[number]["key"];

const inputCls =
  "h-8 rounded-md border border-border bg-canvas px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

function autoMatch(headers: string[]): Record<FieldKey, string> {
  const map: Partial<Record<FieldKey, string>> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const field of LEAD_FIELDS) {
    const target = norm(field.key);
    const match = headers.find((h) => norm(h) === target || norm(h).includes(target));
    if (match) map[field.key] = match;
  }
  return map as Record<FieldKey, string>;
}

export function LeadImporter({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"file" | "sheet" | "map" | "result">("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "new">("skip");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);

  function reset() {
    setStep("file");
    setFile(null);
    setSheets([]);
    setSelectedSheet("");
    setHeaders([]);
    setRows([]);
    setMapping({} as Record<FieldKey, string>);
    setSummary(null);
  }

  // The dialog shell stays mounted through its close animation, so reset the
  // wizard whenever it's reopened rather than showing wherever it was left off.
  useEffect(() => {
    if (open) reset();
  }, [open]);

  function handleClose() {
    if (busy) return;
    reset();
    onOpenChange(false);
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
          const rs = results.data;
          setHeaders(hs);
          setRows(rs);
          setMapping(autoMatch(hs));
          setStep("map");
        },
        error: (err) => toast.error(err.message),
      });
    } else if (ext === "xlsx") {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setSheets(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0] ?? "");
      setStep("sheet");
      // store wb on window-ish --- actually re-parse on confirm
      (handleFileSelected as unknown as { __wb?: XLSX.WorkBook }).__wb = wb;
    } else {
      toast.error("Please select a CSV or XLSX file.");
    }
  }

  function loadSheet() {
    const wb = (handleFileSelected as unknown as { __wb?: XLSX.WorkBook }).__wb;
    if (!wb || !selectedSheet) return;
    const sheet = wb.Sheets[selectedSheet];
    const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
    const hs = json[0] ? Object.keys(json[0]) : [];
    setHeaders(hs);
    setRows(json);
    setMapping(autoMatch(hs));
    setStep("map");
  }

  function normalisePhone(s?: string) {
    return (s ?? "").replace(/\D+/g, "");
  }

  async function runImport() {
    setBusy(true);
    const nameCol = mapping.full_name;
    if (!nameCol) {
      toast.error("Map the 'Full name' field before importing.");
      setBusy(false);
      return;
    }

    // Pre-fetch existing leads for duplicate detection
    const { data: existing } = await sb.from("leads").select("id, full_name, phone, email");
    const byPhone = new Map<string, string>();
    const byEmail = new Map<string, string>();
    for (const e of existing ?? []) {
      if (e.phone) byPhone.set(normalisePhone(e.phone), e.id);
      if (e.email) byEmail.set(e.email.toLowerCase(), e.id);
    }

    const stageMap = new Map(PIPELINE_STAGES.map((s) => [s.label.toLowerCase(), s.key]));
    PIPELINE_STAGES.forEach((s) => stageMap.set(s.key, s.key));

    const errors: string[] = [];
    let valid = 0, invalid = 0, duplicates = 0, imported = 0, skipped = 0, failed = 0;
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

    rows.forEach((row, idx) => {
      const name = String(row[nameCol] ?? "").trim();
      if (!name) {
        invalid++;
        errors.push(`Row ${idx + 2}: missing full_name`);
        return;
      }
      const phoneRaw = mapping.phone ? String(row[mapping.phone] ?? "").trim() : "";
      const emailRaw = mapping.email ? String(row[mapping.email] ?? "").trim() : "";
      const phoneNorm = normalisePhone(phoneRaw);
      const emailNorm = emailRaw.toLowerCase();

      let dupId: string | undefined;
      if (phoneNorm && byPhone.has(phoneNorm)) dupId = byPhone.get(phoneNorm);
      if (!dupId && emailNorm && byEmail.has(emailNorm)) dupId = byEmail.get(emailNorm);

      const splitCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
      const num = (s: string) => {
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      const stageRaw = mapping.pipeline_stage ? String(row[mapping.pipeline_stage] ?? "").trim() : "";
      const stage = stageMap.get(stageRaw.toLowerCase()) ?? "new_lead";

      const payload: Record<string, unknown> = {
        full_name: name,
        phone: phoneRaw || null,
        email: emailRaw || null,
        nationality: mapping.nationality ? String(row[mapping.nationality] ?? "") || null : null,
        preferred_language: mapping.preferred_language ? String(row[mapping.preferred_language] ?? "") || null : null,
        budget_min: mapping.budget_min ? num(String(row[mapping.budget_min] ?? "")) : null,
        budget_max: mapping.budget_max ? num(String(row[mapping.budget_max] ?? "")) : null,
        currency: mapping.currency ? String(row[mapping.currency] ?? "") || "QAR" : "QAR",
        preferred_locations: mapping.preferred_locations ? splitCsv(String(row[mapping.preferred_locations] ?? "")) || null : null,
        preferred_property_types: mapping.preferred_property_types ? splitCsv(String(row[mapping.preferred_property_types] ?? "")) || null : null,
        preferred_bedrooms: mapping.preferred_bedrooms
          ? splitCsv(String(row[mapping.preferred_bedrooms] ?? "")).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n))
          : null,
        purchase_purpose: mapping.purchase_purpose ? String(row[mapping.purchase_purpose] ?? "") || null : null,
        buying_timeline: mapping.buying_timeline ? String(row[mapping.buying_timeline] ?? "") || null : null,
        financing_status: mapping.financing_status ? String(row[mapping.financing_status] ?? "") || null : null,
        lead_source: mapping.lead_source ? String(row[mapping.lead_source] ?? "") || null : null,
        pipeline_stage: stage,
        notes: mapping.notes ? String(row[mapping.notes] ?? "") || null : null,
      };

      valid++;
      if (dupId) {
        duplicates++;
        if (duplicateAction === "skip") {
          skipped++;
          return;
        }
        if (duplicateAction === "update") {
          toUpdate.push({ id: dupId, patch: payload });
          return;
        }
        // 'new' falls through to insert
      }
      toInsert.push(payload);
    });

    // Batch insert (chunks of 100)
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100) as never[];
      const { data, error } = await sb.from("leads").insert(chunk).select("id");
      if (error) {
        failed += chunk.length;
        errors.push(error.message);
      } else {
        imported += data?.length ?? 0;
      }
    }

    for (const u of toUpdate) {
      const { error } = await sb.from("leads").update(u.patch as never).eq("id", u.id);
      if (error) {
        failed++;
        errors.push(error.message);
      } else {
        imported++;
      }
    }

    setSummary({
      total: rows.length,
      valid,
      invalid,
      duplicates,
      imported,
      skipped,
      failed,
      errors: errors.slice(0, 20),
    });
    setStep("result");
    setBusy(false);
    qc.invalidateQueries({ queryKey: leadsKeys.all });
  }

  return (
    <DialogShell open={open} onOpenChange={(v) => { if (!v) handleClose(); }} widthClassName="max-w-3xl" ariaLabel="Import leads">
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Import Leads</h3>
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
            <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
              <p className="text-sm">Upload a CSV or XLSX file with your leads.</p>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                id="lead-importer-file"
                onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
              />
              <Button size="sm" className="mt-4" onClick={() => document.getElementById("lead-importer-file")?.click()}>
                Choose file
              </Button>
            </div>
          )}

          {step === "sheet" && (
            <div className="space-y-3">
              <p className="text-sm">Select the worksheet to import from <strong>{file?.name}</strong>:</p>
              <select className={cn(inputCls, "h-10 w-full text-sm")} value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
                {sheets.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>Back</Button>
                <Button size="sm" onClick={loadSheet}>Continue</Button>
              </div>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Column mapping</p>
                <p className="text-xs text-muted-foreground">Match your file columns to lead fields. Required: Full name.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {LEAD_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</span>
                    <select
                      className={inputCls}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    >
                      <option value="">--- Skip ---</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-medium">Duplicate handling (matched by normalised phone or email)</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {(["skip", "update", "new"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={duplicateAction === opt}
                        onChange={() => setDuplicateAction(opt)}
                      />
                      <span>
                        {opt === "skip" && "Skip duplicates"}
                        {opt === "update" && "Update existing records"}
                        {opt === "new" && "Import as new"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Preview: {rows.length} rows detected.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>Back</Button>
                <Button size="sm" onClick={runImport} disabled={busy}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {busy ? "Importing--¦" : "Confirm import"}
                </Button>
              </div>
            </div>
          )}

          {step === "result" && summary && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Import complete</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Total rows" value={summary.total} />
                <Stat label="Valid" value={summary.valid} />
                <Stat label="Invalid" value={summary.invalid} />
                <Stat label="Duplicates" value={summary.duplicates} />
                <Stat label="Imported" value={summary.imported} />
                <Stat label="Skipped" value={summary.skipped} />
                <Stat label="Failed" value={summary.failed} />
              </div>
              {summary.errors.length > 0 && (
                <details className="rounded-lg border border-border bg-background p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Errors ({summary.errors.length})</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {summary.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Import another</Button>
                <Button size="sm" onClick={handleClose}>Done</Button>
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
