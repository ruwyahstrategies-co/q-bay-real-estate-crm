import { useState } from "react";
import { BadgeCheck, Hourglass, UserCog, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "./ui-primitives";
import { SelectField } from "./select-field";
import { QuickActivityDrawer } from "./quick-activity";
import { LeadReassignDialog } from "./lead-reassign-dialog";
import { CloseDealDialog } from "./close-deal-dialog";
import { useStageMoveFlow } from "./stage-move-flow";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useNow } from "@/hooks/use-now";
import { findStage, selectableStages } from "@/lib/pipeline";
import { REASSIGN_MODES, timeLeftLabel } from "@/lib/reassignment";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import {
  useCancelLeadReassignment,
  usePendingReassignmentForLead,
} from "@/hooks/use-lead-reassignment";
import type { Lead } from "@/lib/db";

/** Stage menu, Quick activity, Reassign and Close deal for one lead, each shown only to people who may use it. */
export function LeadHeaderActions({ lead }: { lead: Lead }) {
  const { can } = usePermissions();
  const flow = useStageMoveFlow();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const { data: pending } = usePendingReassignmentForLead(lead.id);

  const canAssign = can("leads", "assign") || can("leads", "reassign");
  const canLog = can("conversations", "create");
  const canMove = can("pipeline", "move") || can("leads", "edit");

  const current = findStage(flow.stages, lead.pipeline_stage);
  const closed = !!current && (current.is_won || current.is_lost);
  const options = selectableStages(flow.stages, lead.pipeline_stage, flow.rights);

  return (
    <>
      {canMove && options.length > 1 && (
        <SelectField
          value={lead.pipeline_stage}
          onChange={(v) => v && v !== lead.pipeline_stage && void flow.requestMove(lead, v)}
          options={options.map((s) => ({ value: s.stage_key, label: s.name }))}
          allowClear={false}
          className="h-8 w-44 text-xs"
          aria-label="Move to stage"
        />
      )}
      {canLog && (
        <Button size="sm" onClick={() => setQuickOpen(true)}>
          <Zap className="h-3.5 w-3.5" /> Quick activity
        </Button>
      )}
      {canAssign && !pending && (
        <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
          <UserCog className="h-3.5 w-3.5" /> {lead.assigned_agent_id ? "Reassign" : "Assign"}
        </Button>
      )}
      {flow.rights.canFinalizeWon && !closed && (
        <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)}>
          <BadgeCheck className="h-3.5 w-3.5" /> Close deal
        </Button>
      )}

      <QuickActivityDrawer open={quickOpen} onOpenChange={setQuickOpen} lead={lead} />
      <LeadReassignDialog open={reassignOpen} onOpenChange={setReassignOpen} leads={[lead]} />
      {closeOpen && <CloseDealDialog open onOpenChange={setCloseOpen} lead={lead} />}
      {flow.host}
    </>
  );
}

/** Shown while a handover is waiting for the receiving agent: who, how, and how long they have. */
export function PendingHandoverBanner({ lead }: { lead: Lead }) {
  const { data: request } = usePendingReassignmentForLead(lead.id);
  const { data: team = [] } = useTeamMembers();
  const { teamMember } = useCurrentUser();
  const { can } = usePermissions();
  const cancel = useCancelLeadReassignment();
  const now = useNow(30_000);
  if (!request) return null;

  const name = (id: string | null) =>
    id ? (team.find((m) => m.id === id)?.full_name ?? "a team member") : "Unassigned";
  const mode = REASSIGN_MODES.find((m) => m.value === request.mode);
  const canCancel = request.requested_by === teamMember?.id || can("leads", "reassign");

  return (
    <Card className="mb-5 border-qbay/30 bg-qbay-tint">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-qbay" />
          <div>
            <p className="text-sm font-semibold">
              Handover to {name(request.to_agent_id)} is waiting for an answer
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {mode?.title ?? request.mode}. Requested by {name(request.requested_by)}. Accept or
              decline by {fmtQatarDateTime(request.deadline_at)} (
              {timeLeftLabel(request.deadline_at, now).toLowerCase()}). The lead stays with{" "}
              {name(request.from_agent_id)} until then.
            </p>
          </div>
        </div>
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={async () => {
              try {
                await cancel.mutateAsync(request.id);
                toast.success("Handover request withdrawn.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Withdraw request
          </Button>
        )}
      </div>
    </Card>
  );
}
