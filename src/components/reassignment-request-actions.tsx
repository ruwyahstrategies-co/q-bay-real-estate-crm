import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import {
  useRespondLeadReassignment,
  type ReassignmentRequest,
} from "@/hooks/use-lead-reassignment";
import { REQUEST_STATUS_LABELS, timeLeftLabel } from "@/lib/reassignment";

/**
 * Accept / Decline for a lead handed to the signed-in agent, shown inside the notification. The answer is
 * decided by the database: a request whose deadline has passed is refused even if this screen still shows it.
 */
export function ReassignmentRequestActions({ request }: { request: ReassignmentRequest }) {
  const respond = useRespondLeadReassignment();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  const pending = request.status === "pending";
  const timeLeft = timeLeftLabel(request.deadline_at, now);
  const overdue = pending && timeLeft === "Expired";

  if (!pending || overdue) {
    return (
      <p className="px-4 pb-3 pl-8 text-[11px] text-muted-foreground">
        {overdue
          ? "Expired: the deadline has passed."
          : (REQUEST_STATUS_LABELS[request.status] ?? request.status)}
      </p>
    );
  }

  async function answer(accept: boolean) {
    try {
      const r = await respond.mutateAsync({ requestId: request.id, accept, note });
      if (r.status === "accepted") {
        toast.success(
          r.mode === "start_over"
            ? "Accepted. The lead is yours and its pipeline starts over."
            : "Accepted. The lead is yours and continues from where it was.",
        );
        if (r.lead_id) navigate({ to: "/leads/$leadId", params: { leadId: r.lead_id } });
      } else if (r.status === "rejected") {
        toast.success("Declined. The lead stays with its current agent.");
      } else {
        toast.error(r.message ?? `This request is ${r.status}.`);
      }
      setDeclining(false);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="px-4 pb-3 pl-8">
      <p className="mb-2 text-[11px] font-medium text-qbay">{timeLeft}</p>
      {declining ? (
        <div className="space-y-2">
          <input
            autoFocus
            className="h-8 w-full rounded-lg border border-border bg-canvas px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20"
            placeholder="Reason for declining (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => answer(false)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {respond.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Confirm decline
            </button>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => setDeclining(false)}
              className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-muted"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => answer(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-qbay px-3 text-xs font-medium text-white hover:bg-qbay-deep disabled:opacity-50"
          >
            {respond.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Accept
          </button>
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => setDeclining(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Decline
          </button>
        </div>
      )}
    </div>
  );
}
