import { useRef, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, CheckCircle2, AlertTriangle, Loader2, Trash2, UserCog, XCircle } from "lucide-react";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { SearchableSelectField } from "./select-field";
import { useTeamMembers } from "@/hooks/use-team";
import {
  useBulkArchive,
  useBulkDelete,
  useBulkReassign,
  type BlockedRecord,
  type BulkEntity,
} from "@/hooks/use-bulk-actions";
import { describeLinks } from "@/hooks/use-leads";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Action bar                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Shown while rows are selected. It only offers what the signed-in person is allowed to do (the database
 * checks again on every record), shows how many rows are selected, and never acts on anything unselected.
 */
export function BulkActionBar({
  count,
  noun,
  canReassign,
  canArchive,
  canDelete,
  showingArchived,
  onReassign,
  onArchive,
  onRestore,
  onDelete,
  onClear,
  children,
}: {
  count: number;
  /** "lead" / "owner", singular. */
  noun: string;
  canReassign?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  /** When the list is showing archived records, Archive becomes Restore. */
  showingArchived?: boolean;
  onReassign: () => void;
  onArchive: () => void;
  onRestore?: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** Extra actions that sit before the standard ones (for example WhatsApp Broadcast). */
  children?: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-qbay/20 bg-qbay-tint px-4 py-2.5 text-xs shadow-card"
    >
      <span className="font-medium text-qbay" aria-live="polite">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      {children}
      {canReassign && (
        <Button size="sm" variant="outline" onClick={onReassign}>
          <UserCog className="h-3.5 w-3.5" /> Reassign
        </Button>
      )}
      {canArchive &&
        (showingArchived ? (
          <Button size="sm" variant="outline" onClick={onRestore ?? onArchive}>
            <ArchiveRestore className="h-3.5 w-3.5" /> Restore
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onArchive}>
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
        ))}
      {canDelete && (
        <Button size="sm" variant="outline" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      )}
      <button type="button" className="ml-auto text-muted-foreground hover:underline" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic operation dialog                                                    */
/* -------------------------------------------------------------------------- */

export type OperationReport = {
  tone: "success" | "partial" | "error";
  headline: string;
  lines?: string[];
  blocked?: BlockedRecord[];
};

type Phase = "confirm" | "running" | "done";

/**
 * Confirm, then run with visible progress, then show exactly what happened. While it runs the dialog cannot
 * be closed or submitted again, so a double click can never start the operation twice.
 */
export function BulkOperationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  confirmDisabled,
  children,
  run,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  /** Extra inputs shown above the buttons (for example the agent picker). */
  children?: ReactNode;
  run: (onProgress: (done: number, total: number) => void) => Promise<OperationReport>;
  /** Called once the operation has finished, with its report. */
  onFinished?: (report: OperationReport) => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<OperationReport | null>(null);
  const started = useRef(false);

  function reset() {
    setPhase("confirm");
    setProgress({ done: 0, total: 0 });
    setReport(null);
    started.current = false;
  }

  function close() {
    if (phase === "running") return;
    onOpenChange(false);
    // Let the closing animation finish before the content flips back to the confirm step.
    setTimeout(reset, 200);
  }

  async function start() {
    if (started.current) return;
    started.current = true;
    setPhase("running");
    try {
      const result = await run((done, total) => setProgress({ done, total }));
      setReport(result);
      onFinished?.(result);
    } catch (e) {
      const failed: OperationReport = { tone: "error", headline: (e as Error).message || "The operation failed." };
      setReport(failed);
      onFinished?.(failed);
    }
    setPhase("done");
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <DialogShell open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())} widthClassName="max-w-md" ariaLabel={title}>
      <div className="p-5">
        <h3 className="text-base font-semibold">{title}</h3>

        {phase === "confirm" && (
          <>
            {description && <div className="mt-2 text-sm text-muted-foreground">{description}</div>}
            {children}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={start}
                disabled={confirmDisabled}
                className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}

        {phase === "running" && (
          <div className="mt-4" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working. Please keep this window open.
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-qbay transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {progress.done} of {progress.total}
            </p>
          </div>
        )}

        {phase === "done" && report && (
          <div className="mt-4" role="status" aria-live="polite">
            <p
              className={cn(
                "flex items-start gap-2 text-sm font-medium",
                report.tone === "error" && "text-destructive",
              )}
            >
              {report.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-qbay" />
              ) : report.tone === "partial" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{report.headline}</span>
            </p>
            {report.lines && report.lines.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {report.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            {report.blocked && report.blocked.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium">Not deleted (still linked to other records). Archive them instead:</p>
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {report.blocked.map((b) => (
                    <li key={b.id} className="rounded-md border border-border px-2 py-1">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground"> · {describeLinks(b.linked)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

/* -------------------------------------------------------------------------- */
/* The three operations                                                        */
/* -------------------------------------------------------------------------- */

type OperationProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: BulkEntity;
  /** Singular noun for messages, e.g. "lead". */
  noun: string;
  ids: string[];
  /** Called after the operation finished without a total failure, so the page can tidy its selection. */
  onFinished?: () => void;
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function BulkReassignDialog({ open, onOpenChange, entity, noun, ids, onFinished }: OperationProps) {
  const reassign = useBulkReassign(entity);
  const { data: team = [] } = useTeamMembers();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const agent = team.find((m) => m.id === agentId);

  return (
    <BulkOperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reassign ${plural(ids.length, noun)}`}
      description={
        <>
          Choose the agent who takes over. Conversations, notes and history stay with each {noun}; only the assigned
          agent changes.
        </>
      }
      confirmLabel={`Reassign ${plural(ids.length, noun)}`}
      confirmDisabled={!agentId}
      run={async (onProgress) => {
        const r = await reassign.mutateAsync({ ids, toAgentId: agentId!, reason, onProgress });
        const lines: string[] = [];
        if (r.unchanged) lines.push(`${plural(r.unchanged, noun)} already belonged to ${agent?.full_name ?? "that agent"}.`);
        if (r.missing) lines.push(`${plural(r.missing, noun)} no longer existed.`);
        if (r.failed) lines.push(`${plural(r.failed, noun)} could not be processed${r.failureMessage ? `: ${r.failureMessage}` : "."}`);
        const tone = r.failed ? (r.reassigned ? "partial" : "error") : "success";
        return {
          tone,
          headline: `${plural(r.reassigned, noun)} reassigned to ${agent?.full_name ?? "the selected agent"}.`,
          lines,
        };
      }}
      onFinished={(rep) => {
        if (rep.tone !== "error") onFinished?.();
        setAgentId(null);
        setReason("");
      }}
    >
      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">New agent</span>
          <SearchableSelectField
            value={agentId}
            onChange={setAgentId}
            options={team.filter((m) => m.is_active !== false).map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Search and select an agent"
            searchPlaceholder="Search agents..."
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reason (optional)</span>
          <input
            className="h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: covering leave"
          />
        </label>
      </div>
    </BulkOperationDialog>
  );
}

export function BulkArchiveDialog({
  open,
  onOpenChange,
  entity,
  noun,
  ids,
  restore,
  onFinished,
}: OperationProps & { restore?: boolean }) {
  const archive = useBulkArchive(entity);
  const verb = restore ? "Restore" : "Archive";
  return (
    <BulkOperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${verb} ${plural(ids.length, noun)}?`}
      description={
        restore
          ? `The selected ${noun}s return to the active list.`
          : `Archived ${noun}s leave the active list but keep all their history. You can restore them later.`
      }
      confirmLabel={`${verb} ${plural(ids.length, noun)}`}
      run={async (onProgress) => {
        const r = await archive.mutateAsync({ ids, archive: !restore, onProgress });
        const lines: string[] = [];
        if (r.unchanged) lines.push(`${plural(r.unchanged, noun)} ${restore ? "were already active" : "were already archived"}.`);
        if (r.inaccessible) lines.push(`${plural(r.inaccessible, noun)} could not be changed because you do not have access to them.`);
        if (r.failed) lines.push(`${plural(r.failed, noun)} could not be processed${r.failureMessage ? `: ${r.failureMessage}` : "."}`);
        const tone = r.failed || r.inaccessible ? (r.changed ? "partial" : "error") : "success";
        return { tone, headline: `${plural(r.changed, noun)} ${restore ? "restored" : "archived"}.`, lines };
      }}
      onFinished={(rep) => rep.tone !== "error" && onFinished?.()}
    />
  );
}

export function BulkDeleteDialog({ open, onOpenChange, entity, noun, ids, onFinished }: OperationProps) {
  const del = useBulkDelete(entity);
  return (
    <BulkOperationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Permanently delete ${plural(ids.length, noun)}?`}
      description={
        <>
          This cannot be undone. A {noun} that still has linked records (conversations, tasks, viewings, offers or
          properties) is <strong>not</strong> deleted; you will be shown which ones so you can archive them instead.
        </>
      }
      confirmLabel={`Delete ${plural(ids.length, noun)}`}
      destructive
      run={async (onProgress) => {
        const r = await del.mutateAsync({ ids, onProgress });
        const lines: string[] = [];
        if (r.inaccessible) lines.push(`${plural(r.inaccessible, noun)} could not be found or you do not have access to them.`);
        if (r.failed) lines.push(`${plural(r.failed, noun)} could not be processed${r.failureMessage ? `: ${r.failureMessage}` : "."}`);
        const incomplete = r.blocked.length > 0 || r.failed > 0 || r.inaccessible > 0;
        const tone = incomplete ? (r.deleted ? "partial" : "error") : "success";
        return { tone, headline: `${plural(r.deleted, noun)} deleted.`, lines, blocked: r.blocked };
      }}
      onFinished={(rep) => rep.tone !== "error" && onFinished?.()}
    />
  );
}
