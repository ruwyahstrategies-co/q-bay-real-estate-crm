import { useEffect, useRef, useState } from "react";
import { ChevronDown, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { StatusBadge } from "./status-badge";
import { useMarkLeadRentedFromOutside } from "@/hooks/use-leads";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { LEAD_OUTCOME_LABELS, fmtDate, type Lead, type LeadOutcome } from "@/lib/db";

const outcomeLabel = (o: string) => LEAD_OUTCOME_LABELS[o as LeadOutcome] ?? o;

/** Small badge for a lead that has a recorded outcome, or nothing when it has none. */
export function LeadOutcomeBadge({ lead }: { lead: Pick<Lead, "outcome"> }) {
  if (!lead.outcome) return null;
  return <StatusBadge variant="orange">{outcomeLabel(lead.outcome)}</StatusBadge>;
}

/** The outcome, when it happened, who recorded it and the note, kept on the lead. */
export function LeadOutcomeCard({ lead }: { lead: Lead }) {
  const { data: team = [] } = useTeamMembers();
  if (!lead.outcome) return null;
  const by = team.find((t) => t.id === lead.outcome_by)?.full_name;
  return (
    <Card className="md:col-span-2">
      <h4 className="text-sm font-semibold">Outcome: {outcomeLabel(lead.outcome)}</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        {lead.outcome === "rented_from_outside"
          ? "This lead rented a property outside Q-Bay. It is closed, not a Q-Bay rental, and no Q-Bay transaction was created."
          : null}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <dt className="text-muted-foreground">Recorded on</dt>
        <dd>{lead.outcome_at ? fmtDate(lead.outcome_at) : "-"}</dd>
        <dt className="text-muted-foreground">Recorded by</dt>
        <dd>{by ?? "-"}</dd>
        <dt className="text-muted-foreground">Note</dt>
        <dd className="whitespace-pre-wrap">{lead.outcome_note ?? "-"}</dd>
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        To reopen this lead, move it to another pipeline stage. The outcome is cleared
        automatically.
      </p>
    </Card>
  );
}

/**
 * "Mark as" menu on a Rent lead. Today it holds one closed outcome, Rented from Outside; more
 * closed or lost reasons can be added to the same menu. Nothing shows for Sale leads, leads that
 * already have an outcome, won leads, or people who cannot edit the lead.
 */
export function LeadOutcomeMenu({ lead }: { lead: Lead }) {
  const { can } = usePermissions();
  const mark = useMarkLeadRentedFromOutside();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const eligible =
    lead.transaction_intent === "rent" &&
    !lead.outcome &&
    lead.pipeline_stage !== "won" &&
    lead.status === "active" &&
    (can("leads", "edit") || can("pipeline", "move"));
  if (!eligible) return null;

  async function confirm() {
    try {
      await mark.mutateAsync({ id: lead.id, note });
      toast.success("Lead marked as Rented from Outside");
      setConfirmOpen(false);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          Mark as <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-canvas p-1 shadow-lg"
          >
            <button
              role="menuitem"
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              <DoorOpen className="h-3.5 w-3.5" /> Rented from Outside
            </button>
          </div>
        )}
      </div>

      <DialogShell
        open={confirmOpen}
        onOpenChange={(v) => !v && !mark.isPending && setConfirmOpen(false)}
        ariaLabel="Mark as Rented from Outside"
        widthClassName="max-w-md"
      >
        <div className="p-5">
          <h3 className="text-base font-semibold">Mark as Rented from Outside?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {lead.full_name} rented a property that is not in Q-Bay inventory. The lead is closed
            and leaves your working pipeline, and its notes and activity are kept. This is not a
            Q-Bay rental, so no transaction is created.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </span>
            <textarea
              className="h-20 rounded-lg border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Where or how they rented, for example another agency or directly from a landlord"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </label>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={mark.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={confirm} disabled={mark.isPending}>
              {mark.isPending ? "Saving..." : "Mark as Rented from Outside"}
            </Button>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
