import { useState } from "react";
import { X, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SearchableSelectField } from "./select-field";
import { useAssignedRecordCounts, useReassignTeamMemberRecords, type ReassignmentCategory } from "@/hooks/use-reassignment";
import { useTeamMembers } from "@/hooks/use-team";
import type { StaffTeamMember } from "@/lib/db-extensions";

const CATEGORY_LABELS: Record<ReassignmentCategory, string> = {
  leads: "Leads",
  properties: "Properties",
  developments: "Developments",
  owners: "Owners",
  viewings: "Viewings",
  offers: "Offers",
  tasks: "Tasks / Follow-Ups",
  transactions: "Transactions",
};

/**
 * Reassignment workflow shown before deactivating/deleting a team member
 * (module L). Shows record counts per category and lets the admin pick a
 * different replacement agent per category; reassignment runs as one
 * transaction via the reassign_team_member_records RPC.
 */
export function ReassignmentDialog({
  open,
  onOpenChange,
  member,
  onProceed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: StaffTeamMember | null;
  /** Called after reassignment (or immediately if nothing was assigned) with the action to take next. */
  onProceed: (action: "deactivate" | "delete") => void;
}) {
  const { data: counts } = useAssignedRecordCounts(member?.id);
  const { data: team = [] } = useTeamMembers();
  const reassign = useReassignTeamMemberRecords();
  const [targets, setTargets] = useState<Partial<Record<ReassignmentCategory, string>>>({});

  const otherAgents = team.filter((m) => m.id !== member?.id);
  const categories = (Object.keys(CATEGORY_LABELS) as ReassignmentCategory[]).filter((c) => (counts?.[c] ?? 0) > 0);
  const hasAssigned = categories.length > 0;

  async function handleReassignAndProceed(action: "deactivate" | "delete") {
    if (!member) return;
    const chosen = Object.fromEntries(Object.entries(targets).filter(([, v]) => !!v));
    try {
      if (Object.keys(chosen).length > 0) {
        await reassign.mutateAsync({ fromAgentId: member.id, targets: chosen });
        toast.success("Records reassigned");
      }
      onOpenChange(false);
      setTargets({});
      onProceed(action);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!member) return null;

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Reassign records">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Reassign {member.full_name}'s records</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {!hasAssigned ? (
          <p className="text-sm text-muted-foreground">No assigned records found. It's safe to proceed directly.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Choose a replacement agent per category. Leave a category blank to leave those records unassigned instead.
            </p>
            {categories.map((cat) => (
              <div key={cat} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{CATEGORY_LABELS[cat]}</p>
                  <p className="text-xs text-muted-foreground">{counts?.[cat]} record{counts?.[cat] === 1 ? "" : "s"}</p>
                </div>
                <SearchableSelectField
                  value={targets[cat] ?? null}
                  onChange={(v) => setTargets((p) => ({ ...p, [cat]: v ?? undefined }))}
                  options={otherAgents.map((a) => ({ value: a.id, label: a.full_name }))}
                  placeholder="Leave unassigned"
                  emptyLabel="Leave unassigned"
                  searchPlaceholder="Search agents..."
                />
              </div>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border p-5">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          variant="outline"
          size="sm"
          disabled={reassign.isPending}
          onClick={() => handleReassignAndProceed("deactivate")}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" /> {hasAssigned ? "Reassign & Deactivate" : "Deactivate"}
        </Button>
        <Button
          size="sm"
          disabled={reassign.isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={() => handleReassignAndProceed("delete")}
        >
          {hasAssigned ? "Reassign & Delete" : "Delete"}
        </Button>
      </div>
    </DrawerShell>
  );
}
