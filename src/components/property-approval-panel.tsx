import { useState } from "react";
import { CheckCircle2, MessageSquareWarning, ShieldCheck, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, Button } from "./ui-primitives";
import { ApprovalBadge } from "./approval-badge";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import {
  usePropertyApprovalEvents,
  useResubmitProperty,
  useReviewProperty,
  type ApprovalStatus,
} from "@/hooks/use-properties";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import type { Property } from "@/lib/db";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  submitted: "Submitted for approval",
  auto_approved: "Created by an approver",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Returned for changes",
  resubmitted: "Resubmitted for approval",
  edited_after_approval: "Edited after approval, sent back for review",
};

/**
 * Approval status of a property and the actions that follow from it. Approving and publishing are separate:
 * approval makes a property eligible for the website, the publish switch decides whether it appears. The
 * database enforces every rule here, so these buttons only reflect what will be accepted.
 */
export function PropertyApprovalPanel({ property }: { property: Property }) {
  const { can } = usePermissions();
  const { teamMember: me } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const { data: events = [] } = usePropertyApprovalEvents(property.id);
  const review = useReviewProperty();
  const resubmit = useResubmitProperty();
  const [mode, setMode] = useState<null | "return" | "reject" | "resubmit">(null);
  const [note, setNote] = useState("");

  const status = property.approval_status as ApprovalStatus;
  const canApprove = can("properties", "approve");
  const canEdit = can("properties", "edit");
  const submittedByMe = !!me && property.submitted_by === me.id;
  const nameOf = (id: string | null) => team.find((m) => m.id === id)?.full_name ?? "a team member";
  const lastDecision = events.find((e) => e.action === "rejected" || e.action === "changes_requested");
  const busy = review.isPending || resubmit.isPending;

  // Nothing to say or do for an approved property unless the person can review it.
  if (status === "approved" && !canApprove && events.length === 0) return null;

  async function decide(decision: "approve" | "reject" | "return") {
    if (busy) return;
    try {
      await review.mutateAsync({ id: property.id, decision, note });
      toast.success(
        decision === "approve" ? "Property approved" : decision === "reject" ? "Property rejected" : "Property returned for changes",
      );
      setMode(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doResubmit() {
    if (busy) return;
    try {
      await resubmit.mutateAsync({ id: property.id, note });
      toast.success("Resubmitted for approval");
      setMode(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className={cn("mb-5", status === "pending" && "border-amber-300/70", status === "rejected" && "border-destructive/40")}>
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-qbay" />
        <h4 className="text-sm font-semibold">Approval</h4>
        <ApprovalBadge status={status} />
        {property.reviewed_at && status === "approved" && (
          <span className="text-xs text-muted-foreground">
            by {nameOf(property.reviewed_by)} on {fmtQatarDateTime(property.reviewed_at)}
          </span>
        )}
        {status === "pending" && property.submitted_at && (
          <span className="text-xs text-muted-foreground">
            submitted by {nameOf(property.submitted_by)} on {fmtQatarDateTime(property.submitted_at)}
          </span>
        )}
      </div>

      {status === "pending" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {canApprove
            ? "Review the details below. Approving makes this property eligible for the website; publishing is a separate switch."
            : "Waiting for an Administrator to review. This property is hidden from the public website until it is approved."}
        </p>
      )}
      {(status === "changes_requested" || status === "rejected") && (
        <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <p className="font-medium">
            {status === "rejected" ? "Rejected" : "Changes requested"}
            {lastDecision ? ` by ${nameOf(lastDecision.actor_team_member_id)}` : ""}
          </p>
          {lastDecision?.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lastDecision.note}</p>}
          {canEdit && <p className="mt-1 text-muted-foreground">Update the property, then resubmit it for approval.</p>}
        </div>
      )}

      {mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canApprove && status !== "approved" && (
            <span className="inline-flex flex-col">
              <Button size="sm" disabled={busy || submittedByMe} onClick={() => decide("approve")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </Button>
              {submittedByMe && (
                <span className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">
                  You submitted this property, so another Administrator must approve it.
                </span>
              )}
            </span>
          )}
          {canApprove && (status === "pending" || status === "approved") && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("return")}>
                <MessageSquareWarning className="h-3.5 w-3.5" /> Return for changes
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setMode("reject")}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
          {canEdit && (status === "changes_requested" || status === "rejected") && (!property.submitted_by || submittedByMe || canApprove) && (
            <Button size="sm" disabled={busy} onClick={() => setMode("resubmit")}>
              <RotateCcw className="h-3.5 w-3.5" /> Resubmit for approval
            </Button>
          )}
        </div>
      )}

      {mode !== null && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {mode === "resubmit" ? "What did you change? (optional)" : "Reason (required)"}
            </span>
            <textarea
              className="h-20 rounded-lg border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "resubmit" ? "For example: added the unit number and photos" : "Tell the agent what to fix"}
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setNote("");
              }}
            >
              Back
            </Button>
            <Button
              size="sm"
              disabled={busy || (mode !== "resubmit" && !note.trim())}
              className={mode === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => (mode === "resubmit" ? doResubmit() : decide(mode))}
            >
              {mode === "resubmit" ? "Resubmit" : mode === "reject" ? "Reject property" : "Return for changes"}
            </Button>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Approval history ({events.length})</summary>
          <ol className="mt-2 space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border border-border px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtQatarDateTime(e.created_at)}</span>
                </div>
                <p className="text-muted-foreground">by {nameOf(e.actor_team_member_id)}</p>
                {e.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}
