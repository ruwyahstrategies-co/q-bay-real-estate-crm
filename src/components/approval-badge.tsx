import { StatusBadge } from "./status-badge";
import { APPROVAL_LABELS, type ApprovalStatus } from "@/hooks/use-properties";

const VARIANT: Record<ApprovalStatus, "green" | "amber" | "red" | "neutral"> = {
  approved: "green",
  pending: "amber",
  changes_requested: "amber",
  rejected: "red",
};

/** Where a property stands in the approval workflow. */
export function ApprovalBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const key = (status ?? "approved") as ApprovalStatus;
  return (
    <StatusBadge variant={VARIANT[key] ?? "neutral"} className={className}>
      {APPROVAL_LABELS[key] ?? status}
    </StatusBadge>
  );
}
