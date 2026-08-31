import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSignature, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useOffers, useUpdateOffer, OFFER_STATUSES } from "@/hooks/use-offers";
import { fmtDateTime } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/offers")({
  head: () => ({ meta: [{ title: "Offers" }] }),
  component: OffersPage,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-pastel-blue",
  countered: "bg-pastel-purple",
  accepted: "bg-pastel-green",
  rejected: "bg-[#FADCDA]",
  withdrawn: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null) return "-";
  return `${currency ?? "QAR"} ${amount.toLocaleString()}`;
}

function OffersPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const [status, setStatus] = useState<string>("");
  const [mineOnly, setMineOnly] = useState(!can("offers", "view_all") && !can("offers", "view_team"));
  const { data: offers = [] } = useOffers({
    status: status || undefined,
    agentId: mineOnly ? teamMember?.id : undefined,
  });
  const update = useUpdateOffer();
  const canEdit = can("offers", "edit");

  const setStatusOn = async (id: string, next: string) => {
    try {
      await update.mutateAsync({ id, patch: { status: next, decided_at: ["accepted", "rejected", "withdrawn", "expired"].includes(next) ? new Date().toISOString() : null } });
      toast.success(`Offer marked ${next}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <PermissionGate module="offers" action="view" page>
        <PageHeader eyebrow="Negotiation" title="Offers" description="Offers in progress against leads, properties and developments." />

        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              className="h-8 w-44 text-xs"
              value={status || null}
              onChange={(v) => setStatus(v ?? "")}
              options={OFFER_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
              emptyLabel="All statuses"
            />
            {(can("offers", "view_all") || can("offers", "view_team")) && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My offers only
              </label>
            )}
          </div>
        </Card>

        <DataTable
          columns={["Date", "Lead", "Property / Development", "Amount", "Status", "Actions"]}
          empty={<EmptyState icon={<FileSignature className="h-4 w-4" />} title="No offers yet" description="Offers are logged from a lead's profile during negotiation." />}
        >
          {offers.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0 hover:bg-background/60">
              <td className="px-4 py-3 text-xs">{fmtDateTime(o.created_at)}</td>
              <td className="px-4 py-3 text-sm font-medium">
                {o.lead_id ? <Link to="/leads/$leadId" params={{ leadId: o.lead_id }} className="hover:underline">{o.leads?.full_name ?? "Lead"}</Link> : "-"}
              </td>
              <td className="px-4 py-3 text-xs">
                {o.property_id ? (
                  <Link to="/properties/$propertyId" params={{ propertyId: o.property_id }} className="hover:underline">{o.properties?.title ?? "Property"}</Link>
                ) : o.development_id ? (
                  <Link to="/developments/$developmentId" params={{ developmentId: o.development_id }} className="hover:underline">{o.developments?.name ?? "Development"}</Link>
                ) : "-"}
              </td>
              <td className="px-4 py-3 text-xs">{formatAmount(o.amount, o.currency)}</td>
              <td className="px-4 py-3 text-xs">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", STATUS_COLORS[o.status] ?? "bg-muted")}>{o.status.replace(/_/g, " ")}</span>
              </td>
              <td className="px-4 py-3">
                {canEdit && !["accepted", "rejected", "withdrawn", "expired"].includes(o.status) && (
                  <div className="flex items-center gap-1">
                    <button className="rounded-md p-1.5 hover:bg-muted" title="Mark accepted" onClick={() => setStatusOn(o.id, "accepted")}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-muted text-destructive" title="Mark rejected" onClick={() => setStatusOn(o.id, "rejected")}>
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </PermissionGate>
    </AppShell>
  );
}
