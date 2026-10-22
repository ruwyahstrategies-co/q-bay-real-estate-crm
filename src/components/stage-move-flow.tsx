import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { ConfirmDialog } from "./confirm-dialog";
import { CloseDealDialog, type ClosingLead } from "./close-deal-dialog";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/db";
import { blockedMoveReason, findStage, isBackwardMove } from "@/lib/pipeline";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useChangePipelineStage } from "@/hooks/use-leads";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { useLeadReferences } from "@/hooks/use-references";
import { useSetNegotiationProperty } from "@/hooks/use-closing";

export type MovableLead = ClosingLead & { pipeline_stage: string };

type Interest = {
  property_id: string;
  status: string | null;
  properties: {
    title: string;
    reference_code: string | null;
    price: number | null;
    currency: string | null;
  } | null;
};

/**
 * When a lead enters Negotiation the agent says which of its interested properties is being reserved. Only
 * that interest changes. Holding the property itself as Reserved is a separate, explicit choice.
 */
function NegotiationPropertyDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: MovableLead;
}) {
  const { data: refs, isLoading } = useLeadReferences(open ? lead.id : undefined);
  const save = useSetNegotiationProperty();
  const interests = ((refs?.interests ?? []) as unknown as Interest[]).filter((i) => i.properties);
  const current = interests.find((i) => i.status === "reserved")?.property_id ?? null;
  const [choice, setChoice] = useState<string | null>(null);
  const [hold, setHold] = useState(false);
  const selected = choice ?? current ?? (interests.length === 1 ? interests[0].property_id : null);

  async function submit() {
    if (!selected) return;
    try {
      await save.mutateAsync({ leadId: lead.id, propertyId: selected, holdProperty: hold });
      toast.success(
        hold ? "Property reserved for this lead." : "Property marked as the one being negotiated.",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => !save.isPending && onOpenChange(v)}
      widthClassName="max-w-lg"
      ariaLabel="Negotiated property"
    >
      <div className="p-5">
        <h3 className="text-base font-semibold">Which property is being negotiated?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {lead.full_name} is now in Negotiation. Choose the property being reserved. The other
          shortlisted properties stay as they are.
        </p>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading properties...</p>
          ) : interests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              This lead has no property interests yet. Add them with Edit, then choose the
              negotiated property from the Property Interests tab.
            </p>
          ) : (
            interests.map((i) => (
              <label
                key={i.property_id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors",
                  selected === i.property_id
                    ? "border-qbay bg-qbay-tint"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="negotiated-property"
                  className="mt-1 accent-[var(--qbay-green)]"
                  checked={selected === i.property_id}
                  onChange={() => setChoice(i.property_id)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {i.properties?.reference_code ? `${i.properties.reference_code} · ` : ""}
                    {i.properties?.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {i.properties?.price != null
                      ? fmtMoney(i.properties.price, i.properties.currency)
                      : "No price"}
                    {i.status === "reserved" ? " · currently in negotiation" : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        {interests.length > 0 && (
          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={hold}
              onChange={(e) => setHold(e.target.checked)}
            />
            <span>
              Also mark the property as <strong className="text-foreground">Reserved</strong> in the
              inventory while this lead negotiates. It becomes available again if the lead is lost.
            </span>
          </label>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            {interests.length === 0 ? "Close" : "Skip for now"}
          </Button>
          {interests.length > 0 && (
            <Button size="sm" onClick={submit} disabled={!selected || save.isPending}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

/** Super Administrator moving a lead backwards, or out of a closed stage: the reason is recorded in its history. */
function StageCorrectionDialog({
  open,
  leadName,
  fromLabel,
  toLabel,
  leavingWon,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadName: string;
  fromLabel: string;
  toLabel: string;
  leavingWon: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;
  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => !v && !pending && onCancel()}
      widthClassName="max-w-md"
      ariaLabel="Correct stage"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-qbay-tint text-qbay">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">Correct the stage</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Move {leadName} from <strong>{fromLabel}</strong> back to <strong>{toLabel}</strong>.
              As Super Administrator you can correct a mistaken stage. It is recorded in the
              lead&apos;s history with your name and this reason.
            </p>
          </div>
        </div>
        {leavingWon && (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This lead is Won. Moving it out of Won cancels the deal record created when it was
            closed and makes the property available again.
          </p>
        )}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reason *
          </span>
          <textarea
            autoFocus
            className="h-20 rounded-lg border border-border bg-canvas px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: dragged to the wrong column"
          />
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(reason.trim())} disabled={tooShort || pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Correct stage
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/**
 * Every way of moving a lead between pipeline stages goes through here (the Pipeline board and the lead
 * page), so the rules and the follow-up questions are the same everywhere:
 *  - ordinary staff move forward only, and cannot move a lead into Won;
 *  - a Super Administrator can correct any stage, and is asked for a reason that goes into the history;
 *  - Won opens the closing form (date, client, property, price, payment) instead of a bare confirmation;
 *  - entering Negotiation asks which interested property is being reserved;
 *  - Lost asks for confirmation.
 * The database enforces all of it again, so this only decides what to offer and ask.
 */
export function useStageMoveFlow(opts?: {
  optimistic?: (leadId: string, stage: string | null) => void;
}) {
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const change = useChangePipelineStage();
  const superAdmin = teamMember?.role === "super_administrator";
  const rights = { superAdmin, canFinalizeWon: superAdmin || can("leads", "finalize_won") };

  const [correction, setCorrection] = useState<{ lead: MovableLead; target: string } | null>(null);
  const [lost, setLost] = useState<{ lead: MovableLead; target: string } | null>(null);
  const [closing, setClosing] = useState<MovableLead | null>(null);
  const [negotiation, setNegotiation] = useState<MovableLead | null>(null);

  async function applyMove(lead: MovableLead, target: string, reason?: string): Promise<boolean> {
    opts?.optimistic?.(lead.id, target);
    try {
      await change.mutateAsync({
        id: lead.id,
        newStage: target,
        previousStage: lead.pipeline_stage,
        reason,
      });
      const targetStage = findStage(stages, target);
      if (
        targetStage &&
        (targetStage.stage_key === "negotiation" ||
          targetStage.name.trim().toLowerCase() === "negotiation")
      ) {
        setNegotiation({ ...lead, pipeline_stage: target });
      }
      return true;
    } catch (e) {
      // The database is the final judge, so a refusal puts the card back.
      opts?.optimistic?.(lead.id, null);
      toast.error((e as Error).message);
      return false;
    }
  }

  /** Starts a move. Resolves once the move is done or has been abandoned; never throws. */
  async function requestMove(lead: MovableLead, target: string): Promise<void> {
    if (lead.pipeline_stage === target) return;
    const reason = blockedMoveReason(stages, lead.pipeline_stage, target, rights);
    if (reason) {
      toast.error(reason);
      return;
    }
    const targetStage = findStage(stages, target);
    if (targetStage?.is_won) {
      setClosing(lead);
      return;
    }
    if (isBackwardMove(stages, lead.pipeline_stage, target)) {
      setCorrection({ lead, target });
      return;
    }
    if (targetStage?.is_lost) {
      setLost({ lead, target });
      return;
    }
    await applyMove(lead, target);
  }

  const correctionFrom = correction ? findStage(stages, correction.lead.pipeline_stage) : undefined;

  const host = (
    <>
      <StageCorrectionDialog
        open={!!correction}
        leadName={correction?.lead.full_name ?? ""}
        fromLabel={correction ? stageLabelFrom(stages, correction.lead.pipeline_stage) : ""}
        toLabel={correction ? stageLabelFrom(stages, correction.target) : ""}
        leavingWon={!!correctionFrom?.is_won}
        pending={change.isPending}
        onCancel={() => setCorrection(null)}
        onConfirm={async (reason) => {
          if (!correction) return;
          const { lead, target } = correction;
          if (await applyMove(lead, target, reason)) setCorrection(null);
        }}
      />
      <ConfirmDialog
        open={!!lost}
        title={`Close ${lost?.lead.full_name ?? "this lead"} as ${lost ? stageLabelFrom(stages, lost.target) : "Lost"}?`}
        description={
          rights.superAdmin
            ? "The lead leaves the working pipeline. As Super Administrator you can reopen it later."
            : "A closed lead cannot be moved back into the pipeline. Check the stage before you confirm."
        }
        confirmLabel="Close lead"
        destructive
        pending={change.isPending}
        onCancel={() => setLost(null)}
        onConfirm={async () => {
          if (!lost) return;
          const { lead, target } = lost;
          setLost(null);
          await applyMove(lead, target);
        }}
      />
      {closing && (
        <CloseDealDialog
          open
          onOpenChange={(v) => !v && setClosing(null)}
          lead={closing}
          onClosed={() => setClosing(null)}
        />
      )}
      {negotiation && (
        <NegotiationPropertyDialog
          open
          onOpenChange={(v) => !v && setNegotiation(null)}
          lead={negotiation}
        />
      )}
    </>
  );

  return { requestMove, host, rights, stages, pending: change.isPending };
}
