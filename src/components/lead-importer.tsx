import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { cn } from "@/lib/utils";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useLeadChannels } from "@/hooks/use-channels";
import { leadsKeys } from "@/hooks/use-leads";
import {
  countVisibleLeads,
  createSupabaseImportClient,
  fetchExistingLeadRefs,
} from "@/hooks/use-lead-import";
import { downloadCsv } from "@/lib/csv-export";
import { LEAD_INTENTS, LEAD_INTENT_LABELS, type LeadIntent } from "@/lib/lead-model";
import {
  ImportFileError,
  LEAD_IMPORT_FIELDS,
  SUPPORTED_IMPORT_EXTENSIONS,
  autoMapColumns,
  collectIssues,
  executeLeadImport,
  loadImportFile,
  planBlockers,
  planLeadImport,
  sheetToTable,
  type DuplicateAction,
  type ExistingLeadRef,
  type LeadColumnMapping,
  type LeadImportResult,
  type LoadedImportFile,
  type ParsedTable,
  type PlannedRow,
} from "@/lib/lead-import";

type Step = "file" | "sheet" | "map" | "review" | "importing" | "result";

const STEP_LABELS: { step: Step[]; label: string }[] = [
  { step: ["file"], label: "Upload" },
  { step: ["sheet"], label: "Sheet" },
  { step: ["map"], label: "Map and defaults" },
  { step: ["review"], label: "Validate" },
  { step: ["importing", "result"], label: "Import" },
];

const DUPLICATE_OPTIONS: { value: DuplicateAction; label: string; help: string }[] = [
  { value: "skip", label: "Skip duplicates", help: "Leave the lead that is already in the CRM untouched." },
  {
    value: "update",
    label: "Update existing",
    help: "Fill in what the file provides on the existing lead. Blank cells never overwrite anything.",
  },
  { value: "new", label: "Import as new", help: "Create another lead even when the phone or email matches." },
];

const TEMPLATE_CSV =
  "Full Name,Phone,Email,Sale or Rent,Classification,Budget Min,Budget Max,Currency,Nationality,Preferred Language,Preferred Locations,Property Types,Bedrooms,Lead Source,Notes\n" +
  'Jane Doe,+974 5555 1234,jane@example.com,Rent,Renter,8000,12000,QAR,British,English,"The Pearl, Lusail",Apartment,2,Website,Wants a sea view\n';

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "q-bay-lead-import-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function LeadImporter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const { data: channels = [] } = useLeadChannels({ activeOnly: true });
  const canAssignOthers = can("leads", "assign");
  const me = teamMember?.id ?? null;
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("file");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedImportFile | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<LeadColumnMapping>({});

  const [defaultIntent, setDefaultIntent] = useState<LeadIntent>("sale");
  const [agentChoice, setAgentChoice] = useState<string | null>(null);
  const [leadSource, setLeadSource] = useState("Import");
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");

  const [existing, setExisting] = useState<ExistingLeadRef[] | null>(null);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<LeadImportResult | null>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  const busy = step === "importing";

  function reset() {
    setStep("file");
    setFileName("");
    setFileError(null);
    setLoaded(null);
    setSheetName("");
    setSheetError(null);
    setTable(null);
    setMapping({});
    setDefaultIntent("sale");
    setAgentChoice(me);
    setLeadSource("Import");
    setDuplicateAction("skip");
    setExisting(null);
    setExistingError(null);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setVisibleCount(null);
  }

  // The dialog shell stays mounted through its close animation, so start fresh on every open.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (busy) return;
    onOpenChange(false);
  }

  function acceptTable(t: ParsedTable) {
    setTable(t);
    setMapping(autoMapColumns(t.headers));
    setStep("map");
  }

  async function handleFile(file: File) {
    setFileError(null);
    try {
      const loadedFile = loadImportFile(file.name, await file.arrayBuffer());
      setFileName(file.name);
      if (loadedFile.kind === "csv") {
        setLoaded(null);
        acceptTable(loadedFile.table);
        return;
      }
      setLoaded(loadedFile);
      setSheetName(loadedFile.sheetNames[0]);
      setSheetError(null);
      if (loadedFile.sheetNames.length > 1) {
        setStep("sheet");
      } else {
        acceptTable(sheetToTable(loadedFile.workbook, loadedFile.sheetNames[0]));
      }
    } catch (e) {
      const message =
        e instanceof ImportFileError ? e.message : `This file could not be read: ${(e as Error).message}`;
      setFileError(message);
      toast.error(message);
    }
  }

  function loadSheet() {
    if (!loaded || loaded.kind !== "workbook") return;
    try {
      setSheetError(null);
      acceptTable(sheetToTable(loaded.workbook, sheetName));
    } catch (e) {
      setSheetError((e as Error).message);
    }
  }

  const agentOptions = useMemo(
    () =>
      team
        .filter((m) => m.is_active !== false)
        .map((m) => ({ value: m.id, label: m.full_name })),
    [team],
  );

  const planOptions = useMemo(
    () => ({
      defaultIntent,
      duplicateAction,
      defaultLeadSource: leadSource.trim(),
      defaultAgentId: canAssignOthers ? agentChoice : me,
      canAssignOthers,
      currentMemberId: me,
      teamMembers: team
        .filter((m) => m.is_active !== false)
        .map((m) => ({ id: m.id, full_name: m.full_name, email: m.email, code: m.code })),
      stages: stages.map((s) => ({ key: s.stage_key, label: s.name })),
      existing: existing ?? [],
    }),
    [defaultIntent, duplicateAction, leadSource, canAssignOthers, agentChoice, me, team, stages, existing],
  );

  const plan = useMemo(
    () => (table && existing && step !== "file" ? planLeadImport(table, mapping, planOptions) : null),
    // The plan is recomputed only when the inputs change, not on every render (it generates ids).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, mapping, existing, defaultIntent, duplicateAction, leadSource, agentChoice, canAssignOthers, team, stages],
  );

  const blockers = planBlockers(mapping);

  async function goReview() {
    setStep("review");
    setExistingError(null);
    try {
      setExisting(await fetchExistingLeadRefs());
    } catch (e) {
      setExistingError((e as Error).message);
    }
  }

  async function runImport() {
    if (!plan) return;
    setStep("importing");
    setProgress({ done: 0, total: plan.counts.insert + plan.counts.update });
    try {
      const res = await executeLeadImport(plan, createSupabaseImportClient(), {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      if (res.importedLeadIds.length > 0) {
        try {
          setVisibleCount(await countVisibleLeads(res.importedLeadIds));
        } catch {
          setVisibleCount(null);
        }
      }
      if (res.imported + res.updated > 0) {
        toast.success(`Imported ${res.imported}, updated ${res.updated}`);
      }
    } catch (e) {
      toast.error(`The import stopped: ${(e as Error).message}`);
      setResult({
        imported: 0,
        updated: 0,
        skipped: plan.counts.skip,
        invalid: plan.counts.invalid,
        failed: plan.counts.insert + plan.counts.update,
        failures: [{ rowNumber: 0, message: (e as Error).message }],
        importedLeadIds: [],
      });
    }
    setStep("result");
  }

  const issues = useMemo(() => (plan ? collectIssues(plan, result ?? undefined) : []), [plan, result]);

  function downloadIssues() {
    downloadCsv(`lead-import-issues-${new Date().toISOString().slice(0, 10)}.csv`, issues, [
      { key: "row", label: "Spreadsheet row" },
      { key: "outcome", label: "Outcome" },
      { key: "detail", label: "Detail" },
    ]);
  }

  const activeStepIdx = STEP_LABELS.findIndex((s) => s.step.includes(step));

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      widthClassName="max-w-3xl"
      ariaLabel="Import leads"
    >
      <div className="flex max-h-[90vh] w-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Import Leads</h3>
            <ol className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {STEP_LABELS.map((s, i) => (
                <li
                  key={s.label}
                  className={cn(
                    "flex items-center gap-1.5",
                    i === activeStepIdx && "font-semibold text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                      i === activeStepIdx ? "border-qbay bg-qbay text-white" : "border-border",
                      i < activeStepIdx && "border-qbay text-qbay",
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          </div>
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
            <div className="space-y-3">
              <div
                className={cn(
                  "rounded-xl border border-dashed bg-background p-10 text-center transition-colors",
                  dragging ? "border-foreground bg-muted" : "border-border",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
              >
                <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Upload a CSV, XLSX or XLS file with your leads</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every lead needs a <strong>Full Name</strong> and a <strong>Phone</strong>. Sale or Rent
                  is set in the next step if your file does not say.
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept={SUPPORTED_IMPORT_EXTENSIONS.map((e) => `.${e}`).join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
                <Button size="sm" className="mt-4" onClick={() => fileInput.current?.click()}>
                  Choose file
                </Button>
              </div>
              {fileError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Download a CSV template
              </button>
            </div>
          )}

          {step === "sheet" && loaded?.kind === "workbook" && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{fileName}</strong> has {loaded.sheetNames.length} worksheets. Select the one that
                holds your leads:
              </p>
              <SelectField
                value={sheetName}
                onChange={(v) => setSheetName(v ?? "")}
                options={loaded.sheetNames.map((s) => ({ value: s, label: s }))}
                allowClear={false}
                className="h-10 w-full text-sm"
              />
              {sheetError && (
                <p role="alert" className="text-xs text-destructive">
                  {sheetError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("file")}>
                  Back
                </Button>
                <Button size="sm" onClick={loadSheet} disabled={!sheetName}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === "map" && table && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">Match your columns to lead fields</p>
                <p className="text-xs text-muted-foreground">
                  {fileName}
                  {loaded?.kind === "workbook" ? `, sheet "${sheetName}"` : ""}: {table.rows.length} lead
                  rows found. Full Name and Phone are required.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {LEAD_IMPORT_FIELDS.map((f) => {
                  const idx = mapping[f.key];
                  const sample = idx != null ? table.rows[0]?.values[idx] : "";
                  return (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {f.label}
                        {f.required ? " *" : ""}
                      </span>
                      <SelectField
                        value={idx != null ? String(idx) : null}
                        onChange={(v) =>
                          setMapping((m) => ({ ...m, [f.key]: v == null ? null : Number(v) }))
                        }
                        options={table.headers.map((h, i) => ({ value: String(i), label: h }))}
                        emptyLabel="Skip this field"
                        placeholder={f.required ? "Choose a column" : "Skip this field"}
                      />
                      <span className="min-h-[14px] truncate text-[11px] text-muted-foreground">
                        {sample ? `e.g. ${sample}` : (f.hint ?? "")}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium">Import defaults</p>

                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Import these leads as
                  </span>
                  <div className="mt-1.5 inline-flex rounded-lg border border-border bg-canvas p-1">
                    {LEAD_INTENTS.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDefaultIntent(i)}
                        className={cn(
                          "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                          defaultIntent === i
                            ? "bg-qbay text-white"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {LEAD_INTENT_LABELS[i]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Used for rows that do not say Sale or Rent. A mapped Sale or Rent column overrides it
                    row by row.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Assign leads to
                    </span>
                    <div className="mt-1.5">
                      {canAssignOthers ? (
                        <SearchableSelectField
                          value={agentChoice}
                          onChange={setAgentChoice}
                          options={agentOptions}
                          placeholder="Select agent"
                          emptyLabel="Unassigned"
                          searchPlaceholder="Search agents..."
                        />
                      ) : (
                        <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs">
                          {teamMember?.full_name ?? "You"} (imported leads are assigned to you)
                        </p>
                      )}
                    </div>
                    {canAssignOthers && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        For rows without an agent. A mapped Assigned Agent column overrides it.
                      </p>
                    )}
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Lead source when blank
                    </span>
                    <SelectField
                      value={leadSource || null}
                      onChange={(v) => setLeadSource(v ?? "")}
                      options={[
                        ...(channels.some((c) => c.name === "Import")
                          ? []
                          : [{ value: "Import", label: "Import" }]),
                        ...channels.map((c) => ({ value: c.name, label: c.name })),
                      ]}
                      emptyLabel="None"
                    />
                  </label>
                </div>

                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    If a lead already exists (matched by phone or email)
                  </span>
                  <div className="mt-1.5 space-y-1.5">
                    {DUPLICATE_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-start gap-2 text-xs">
                        <input
                          type="radio"
                          className="mt-0.5"
                          checked={duplicateAction === o.value}
                          onChange={() => setDuplicateAction(o.value)}
                        />
                        <span>
                          <span className="font-medium">{o.label}</span>
                          <span className="block text-muted-foreground">{o.help}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {blockers.length > 0 && (
                <ul role="alert" className="space-y-1 text-xs text-destructive">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(loaded?.kind === "workbook" && loaded.sheetNames.length > 1 ? "sheet" : "file")}
                >
                  Back
                </Button>
                <Button size="sm" onClick={goReview} disabled={blockers.length > 0}>
                  Validate
                </Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {existingError ? (
                <p role="alert" className="text-sm text-destructive">
                  Could not load your existing leads to check for duplicates: {existingError}
                </p>
              ) : !plan ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking every row...
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Total rows" value={plan.counts.total} />
                    <Stat label="Valid rows" value={plan.counts.valid} tone="good" />
                    <Stat label="Invalid rows" value={plan.counts.invalid} tone={plan.counts.invalid ? "bad" : undefined} />
                    <Stat
                      label="Duplicates"
                      value={plan.counts.duplicatesExisting + plan.counts.duplicatesInFile}
                      hint={`${plan.counts.duplicatesExisting} in CRM, ${plan.counts.duplicatesInFile} in file`}
                    />
                    <Stat label="Will insert" value={plan.counts.insert} tone="good" />
                    <Stat label="Will update" value={plan.counts.update} />
                    <Stat label="Will skip" value={plan.counts.skip} />
                    <Stat label="With warnings" value={plan.counts.withWarnings} />
                  </div>
                  {plan.notes.map((n) => (
                    <p key={n} className="rounded-lg border border-border bg-background p-2.5 text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                  {plan.counts.invalid > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Invalid rows are not imported. Fix them in the file and import again, or continue with
                      the valid rows.
                    </p>
                  )}
                  <IssueList issues={issues} onDownload={downloadIssues} />
                  <PlanPreview plan={plan} />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep("map")}>
                      Back
                    </Button>
                    <Button size="sm" onClick={runImport} disabled={plan.counts.insert + plan.counts.update === 0}>
                      {plan.counts.insert + plan.counts.update === 0
                        ? "Nothing to import"
                        : `Import ${plan.counts.insert + plan.counts.update} lead${plan.counts.insert + plan.counts.update === 1 ? "" : "s"}`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-3 py-6 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium">
                Importing {progress.done} of {progress.total}...
              </p>
              <div className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-qbay transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Keep this window open until it finishes.</p>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-qbay" />
                <p className="text-sm font-semibold">Import finished</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Imported" value={result.imported} tone="good" />
                <Stat label="Updated" value={result.updated} />
                <Stat label="Skipped" value={result.skipped} />
                <Stat label="Failed" value={result.failed} tone={result.failed ? "bad" : undefined} />
              </div>
              {result.invalid > 0 && (
                <p className="text-xs text-muted-foreground">
                  {result.invalid} invalid row{result.invalid === 1 ? " was" : "s were"} not imported.
                </p>
              )}
              {visibleCount != null && result.imported > 0 && (
                <p className="text-xs text-muted-foreground">
                  {visibleCount === result.imported
                    ? `All ${visibleCount} imported leads are in your Leads list now.`
                    : `${visibleCount} of ${result.imported} imported leads are in your Leads list. The rest were assigned to other agents and appear in their lists.`}
                </p>
              )}
              <IssueList issues={issues} onDownload={downloadIssues} />
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

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "good" && "text-qbay",
          tone === "bad" && "text-destructive",
        )}
      >
        {value.toLocaleString()}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SHOWN_ISSUES = 200;

function IssueList({
  issues,
  onDownload,
}: {
  issues: { row: number; outcome: string; detail: string }[];
  onDownload: () => void;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-medium">Rows that need attention ({issues.length})</p>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          <Download className="h-3 w-3" /> Download list
        </button>
      </div>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto text-xs">
        {issues.slice(0, SHOWN_ISSUES).map((i, idx) => (
          <li key={`${i.row}-${idx}`} className="flex gap-3 px-3 py-1.5">
            <span className="w-14 shrink-0 text-muted-foreground">{i.row ? `Row ${i.row}` : "File"}</span>
            <span
              className={cn(
                "w-14 shrink-0 font-medium",
                (i.outcome === "Invalid" || i.outcome === "Failed") && "text-destructive",
              )}
            >
              {i.outcome}
            </span>
            <span className="min-w-0 flex-1">{i.detail}</span>
          </li>
        ))}
      </ul>
      {issues.length > SHOWN_ISSUES && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Showing the first {SHOWN_ISSUES}. Download the list for all {issues.length}.
        </p>
      )}
    </div>
  );
}

function PlanPreview({ plan }: { plan: { rows: PlannedRow[] } }) {
  const sample = plan.rows.filter((r) => r.status === "insert" || r.status === "update").slice(0, 5);
  if (sample.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5">Row</th>
            <th className="px-3 py-1.5">Name</th>
            <th className="px-3 py-1.5">Phone</th>
            <th className="px-3 py-1.5">Sale or Rent</th>
            <th className="px-3 py-1.5">Classification</th>
            <th className="px-3 py-1.5">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sample.map((r) => (
            <tr key={r.rowNumber}>
              <td className="px-3 py-1.5">{r.rowNumber}</td>
              <td className="px-3 py-1.5">{r.preview.name}</td>
              <td className="px-3 py-1.5">{r.preview.phone}</td>
              <td className="px-3 py-1.5">{r.preview.intent === "rent" ? "Rent" : "Sale"}</td>
              <td className="px-3 py-1.5 capitalize">{r.preview.classification ?? "-"}</td>
              <td className="px-3 py-1.5">{r.status === "update" ? "Update existing" : "New lead"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Preview of the first {sample.length} rows that will be imported.
      </p>
    </div>
  );
}
