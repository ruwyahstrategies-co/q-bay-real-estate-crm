import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck2, MapPin, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useViewings, useUpdateViewing, useCompleteViewing } from "@/hooks/use-viewings";
import { fmtDateTime } from "@/lib/db";
import { cn } from "@/lib/utils";
import { VIEWING_STATUSES } from "@/lib/db";

export const Route = createFileRoute("/viewings")({
  head: () => ({ meta: [{ title: "Viewings" }] }),
  component: ViewingsPage,
});

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-pastel-blue",
  confirmed: "bg-pastel-purple",
  completed: "bg-pastel-green",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-[#FADCDA]",
};

function ViewingsPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const [status, setStatus] = useState<string>("");
  const [mineOnly, setMineOnly] = useState(!can("viewings", "view_all") && !can("viewings", "view_team"));
  const { data: viewings = [] } = useViewings({
    status: status || undefined,
    agentId: mineOnly ? teamMember?.id : undefined,
  });
  const update = useUpdateViewing();
  const complete = useCompleteViewing();
  const canEdit = can("viewings", "edit");
  const canComplete = can("viewings", "complete");

  return (
    <AppShell>
      <PermissionGate module="viewings" action="view" page>
      <PageHeader eyebrow="Schedule" title="Viewings" description="Property viewing appointments across leads." />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select className="h-8 rounded-md border border-border bg-canvas px-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {VIEWING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          {(can("viewings", "view_all") || can("viewings", "view_team")) && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My viewings only
            </label>
          )}
        </div>
      </Card>

      <DataTable
        columns={["Date", "Lead", "Property", "Status", "Location", "Actions"]}
        empty={<EmptyState icon={<CalendarCheck2 className="h-4 w-4" />} title="No viewings scheduled" description="Schedule a viewing from a lead's profile." />}
      >
        {viewings.map((v) => (
          <tr key={v.id} className="border-b border-border last:border-0 hover:bg-background/60">
            <td className="px-4 py-3 text-xs">{fmtDateTime(v.scheduled_at)}</td>
            <td className="px-4 py-3 text-sm font-medium">
              {v.lead_id ? <Link to="/leads/$leadId" params={{ leadId: v.lead_id }} className="hover:underline">{v.leads?.full_name ?? "Lead"}</Link> : "-"}
            </td>
            <td className="px-4 py-3 text-xs">
              {v.property_id ? <Link to="/properties/$propertyId" params={{ propertyId: v.property_id }} className="hover:underline">{v.properties?.title ?? "Property"}</Link> : "-"}
            </td>
            <td className="px-4 py-3 text-xs">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", STATUS_COLORS[v.status] ?? "bg-muted")}>{v.status.replace(/_/g, " ")}</span>
            </td>
            <td className="px-4 py-3 text-xs">
              {v.latitude && v.longitude ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {v.latitude.toFixed(3)}, {v.longitude.toFixed(3)}</span>
              ) : "-"}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1">
                {canEdit && v.status === "scheduled" && (
                  <button className="rounded-md p-1.5 hover:bg-muted" title="Confirm" onClick={() => update.mutate({ id: v.id, patch: { status: "confirmed" } })}>
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                {canComplete && v.status !== "completed" && v.status !== "cancelled" && (
                  <button
                    className="rounded-md p-1.5 hover:bg-muted"
                    title="Mark completed"
                    onClick={async () => {
                      const useLocation = window.confirm("Attach your current device location to this completed viewing?");
                      if (useLocation && navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            await complete.mutateAsync({ id: v.id });
                            await update.mutateAsync({ id: v.id, patch: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
                          },
                          () => { complete.mutate({ id: v.id }); },
                        );
                      } else {
                        try { await complete.mutateAsync({ id: v.id }); toast.success("Viewing marked completed"); }
                        catch (e) { toast.error((e as Error).message); }
                      }
                    }}
                  >
                    <CalendarCheck2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {canEdit && v.status !== "cancelled" && v.status !== "completed" && (
                  <button className="rounded-md p-1.5 hover:bg-muted text-destructive" title="Cancel" onClick={() => update.mutate({ id: v.id, patch: { status: "cancelled" } })}>
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      </PermissionGate>
    </AppShell>
  );
}
