import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { X, Loader2 } from "lucide-react";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { cn } from "@/lib/utils";
import { sb } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { propertyKeys } from "@/hooks/use-properties";

// Reuses the same CSV/XLSX import wizard shape as LeadImporter, adapted for
// properties: reference_code is the dedup key (matches spec's "reference-code
// duplicate/update handling").

type Row = Record<string, string>;

const PROPERTY_FIELDS = [
  { key: "title", label: "Title *" },
  { key: "reference_code", label: "Reference code" },
  { key: "property_type", label: "Property type" },
  { key: "purpose", label: "Purpose (sale/rent/commercial)" },
  { key: "location", label: "Location" },
  { key: "developer", label: "Developer" },
  { key: "price", label: "Price" },
  { key: "currency", label: "Currency" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "bathrooms", label: "Bathrooms" },
  { key: "size", label: "Size" },
  { key: "availability", label: "Availability" },
  { key: "description", label: "Description" },
] as const;

type FieldKey = (typeof PROPERTY_FIELDS)[number]["key"];

const inputCls = "h-8 rounded-md border border-border bg-canvas px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

function autoMatch(headers: string[]): Record<FieldKey, string> {
  const map: Partial<Record<FieldKey, string>> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const field of PROPERTY_FIELDS) {
    const target = norm(field.key);
    const match = headers.find((h) => norm(h) === target || norm(h).includes(target));
    if (match) map[field.key] = match;
  }
  return map as Record<FieldKey, string>;
}

export function PropertyImporter({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"file" | "sheet" | "map" | "result">("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "new">("update");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ total: number; imported: number; updated: number; skipped: number; failed: number; errors: string[] } | null>(null);

  function reset() {
    setStep("file"); setFile(null); setSheets([]); setSelectedSheet(""); setHeaders([]); setRows([]);
    setMapping({} as Record<FieldKey, string>); setSummary(null);
  }
  useEffect(() => { if (open) reset(); }, [open]);

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
        header: true, skipEmptyLines: true,
        complete: (results) => {
          const hs = results.meta.fields ?? [];
          setHeaders(hs); setRows(results.data); setMapping(autoMatch(hs)); setStep("map");
        },
      });
    } else if (ext === "xlsx") {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setSheets(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0] ?? "");
      setStep("sheet");
      (handleFileSelected as unknown as { __wb?: XLSX.WorkBook }).__wb = wb;
    }
  }

  function loadSheet() {
    const wb = (handleFileSelected as unknown as { __wb?: XLSX.WorkBook }).__wb;
    if (!wb || !selectedSheet) return;
    const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[selectedSheet], { defval: "", raw: false });
    const hs = json[0] ? Object.keys(json[0]) : [];
    setHeaders(hs); setRows(json); setMapping(autoMatch(hs)); setStep("map");
  }

  async function runImport() {
    setBusy(true);
    const titleCol = mapping.title;
    if (!titleCol) { setBusy(false); return; }

    const { data: existing } = await sb.from("properties").select("id, reference_code");
    const byRef = new Map<string, string>();
    for (const e of existing ?? []) if (e.reference_code) byRef.set(e.reference_code.toLowerCase(), e.id);

    const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };

    let imported = 0, updated = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

    for (const row of rows) {
      const title = String(row[titleCol] ?? "").trim();
      if (!title) { failed++; continue; }
      const refCode = mapping.reference_code ? String(row[mapping.reference_code] ?? "").trim() : "";
      const payload: Record<string, unknown> = {
        title,
        reference_code: refCode || null,
        property_type: mapping.property_type ? String(row[mapping.property_type] ?? "") || null : null,
        purpose: mapping.purpose ? String(row[mapping.purpose] ?? "").toLowerCase() || "sale" : "sale",
        location: mapping.location ? String(row[mapping.location] ?? "") || null : null,
        developer: mapping.developer ? String(row[mapping.developer] ?? "") || null : null,
        price: mapping.price ? num(String(row[mapping.price] ?? "")) : null,
        currency: mapping.currency ? String(row[mapping.currency] ?? "") || "QAR" : "QAR",
        bedrooms: mapping.bedrooms ? num(String(row[mapping.bedrooms] ?? "")) : null,
        bathrooms: mapping.bathrooms ? num(String(row[mapping.bathrooms] ?? "")) : null,
        size: mapping.size ? num(String(row[mapping.size] ?? "")) : null,
        availability: mapping.availability ? String(row[mapping.availability] ?? "") || "available" : "available",
        description: mapping.description ? String(row[mapping.description] ?? "") || null : null,
      };

      const dupId = refCode ? byRef.get(refCode.toLowerCase()) : undefined;
      if (dupId) {
        if (duplicateAction === "skip") { skipped++; continue; }
        if (duplicateAction === "update") { toUpdate.push({ id: dupId, patch: payload }); continue; }
      }
      toInsert.push(payload);
    }

    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100) as never[];
      const { data, error } = await sb.from("properties").insert(chunk).select("id");
      if (error) { failed += chunk.length; errors.push(error.message); } else { imported += data?.length ?? 0; }
    }
    for (const u of toUpdate) {
      const { error } = await sb.from("properties").update(u.patch as never).eq("id", u.id);
      if (error) { failed++; errors.push(error.message); } else { updated++; }
    }

    setSummary({ total: rows.length, imported, updated, skipped, failed, errors: errors.slice(0, 20) });
    setStep("result");
    setBusy(false);
    qc.invalidateQueries({ queryKey: propertyKeys.all });
  }

  return (
    <DialogShell open={open} onOpenChange={(v) => { if (!v) handleClose(); }} widthClassName="max-w-3xl" ariaLabel="Import properties">
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Import Properties</h3>
          <button onClick={handleClose} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {step === "file" && (
            <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
              <p className="text-sm">Upload a CSV or XLSX file with your property inventory.</p>
              <input type="file" accept=".csv,.xlsx" className="hidden" id="property-importer-file" onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])} />
              <Button size="sm" className="mt-4" onClick={() => document.getElementById("property-importer-file")?.click()}>Choose file</Button>
            </div>
          )}
          {step === "sheet" && (
            <div className="space-y-3">
              <p className="text-sm">Select the worksheet to import from <strong>{file?.name}</strong>:</p>
              <select className={cn(inputCls, "h-10 w-full text-sm")} value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
                {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>Back</Button>
                <Button size="sm" onClick={loadSheet}>Continue</Button>
              </div>
            </div>
          )}
          {step === "map" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Match your file columns to property fields. Required: Title. Reference code is used to detect duplicates.</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {PROPERTY_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</span>
                    <select className={inputCls} value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                      <option value="">- Skip -</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-medium">Duplicate handling (matched by reference code)</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {(["skip", "update", "new"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5">
                      <input type="radio" checked={duplicateAction === opt} onChange={() => setDuplicateAction(opt)} />
                      <span>{opt === "skip" ? "Skip duplicates" : opt === "update" ? "Update existing" : "Import as new"}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Preview: {rows.length} rows detected.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>Back</Button>
                <Button size="sm" onClick={runImport} disabled={busy}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {busy ? "Importing..." : "Confirm import"}</Button>
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
              {summary.errors.length > 0 && (
                <details className="rounded-lg border border-border bg-background p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Errors ({summary.errors.length})</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">{summary.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
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
