import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Send } from "lucide-react";
import { Card, Button } from "./ui-primitives";
import { SelectField } from "./select-field";
import {
  useAvailabilityConfirmationCadence,
  useConfirmPropertyAvailability,
  useRequestOwnerAvailabilityConfirmation,
  usePropertyConfirmationHistory,
} from "@/hooks/use-availability-confirmations";
import { useOwner } from "@/hooks/use-owners";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  PROPERTY_AVAILABILITIES,
  PROPERTY_AVAILABILITY_LABELS,
  isConfirmationOverdue,
  fmtDateTime,
  type Property,
} from "@/lib/db";

export function PropertyAvailabilityConfirmation({ property }: { property: Property }) {
  const { data: cadenceDays = 30 } = useAvailabilityConfirmationCadence();
  const { data: history = [] } = usePropertyConfirmationHistory(property.id);
  const { data: owner } = useOwner(property.owner_id ?? undefined);
  const { teamMember } = useCurrentUser();
  const confirm = useConfirmPropertyAvailability();
  const requestOwner = useRequestOwnerAvailabilityConfirmation();
  const [response, setResponse] = useState<string | null>(property.availability ?? "available");
  const overdue = isConfirmationOverdue(property);

  async function handleConfirm() {
    if (!response) return;
    try {
      await confirm.mutateAsync({
        propertyId: property.id,
        response: response as "available" | "sold" | "rented" | "reserved" | "unavailable",
        confirmedBy: teamMember?.id ?? null,
        assignedAgentId: property.assigned_agent_id,
        propertyTitle: property.title,
        cadenceDays,
      });
      toast.success("Availability confirmed - next check-in scheduled");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRequestOwner() {
    if (!property.owner_id) {
      toast.error("This property has no linked owner to notify");
      return;
    }
    try {
      await requestOwner.mutateAsync({
        ownerId: property.owner_id,
        propertyId: property.id,
        propertyTitle: property.title,
        recipientName: owner?.name ?? null,
      });
      toast.success("Owner confirmation request queued");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Availability confirmation</h4>
        {overdue && (
          <span className="rounded-full bg-[#FADCDA] px-2 py-0.5 text-[10px] font-medium">
            Needs confirmation
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <dt className="text-muted-foreground">Last confirmed</dt>
        <dd>
          {property.availability_last_confirmed_at
            ? fmtDateTime(property.availability_last_confirmed_at)
            : "Never"}
        </dd>
        <dt className="text-muted-foreground">Next due</dt>
        <dd>
          {property.availability_next_due_at
            ? fmtDateTime(property.availability_next_due_at)
            : "Not scheduled"}
        </dd>
        <dt className="text-muted-foreground">Cadence</dt>
        <dd>Every {cadenceDays} days (Settings)</dd>
      </dl>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Confirm status
          <SelectField
            className="w-40 text-xs"
            value={response}
            onChange={setResponse}
            options={PROPERTY_AVAILABILITIES.map((a) => ({
              value: a,
              label: PROPERTY_AVAILABILITY_LABELS[a],
            }))}
            allowClear={false}
          />
        </label>
        <Button size="sm" disabled={confirm.isPending} onClick={handleConfirm}>
          {confirm.isPending ? "Saving..." : "Confirm availability"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={requestOwner.isPending || !property.owner_id}
          onClick={handleRequestOwner}
        >
          <Send className="h-3.5 w-3.5" /> Ask owner to confirm
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            History
          </p>
          <ul className="space-y-1 text-xs">
            {history.slice(0, 5).map((h: any) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span className="capitalize">
                  {h.response ?? "requested"}{" "}
                  {h.team_members?.full_name ? `· ${h.team_members.full_name}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {fmtDateTime(h.responded_at ?? h.requested_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
