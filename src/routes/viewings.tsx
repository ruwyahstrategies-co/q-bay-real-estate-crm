import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarCheck2, MapPin, Import, Plus, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { ImportViewingDialog } from "@/components/import-viewing-dialog";
import { ScheduleViewingDrawer, ViewingDetailDrawer, ViewingStatusBadge } from "@/components/viewing-drawers";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useViewings } from "@/hooks/use-viewings";
import { VIEWING_STATUSES } from "@/lib/db";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import { titleCase } from "@/lib/utils";
import { propertyCodePrefix } from "@/lib/property-number";

export const Route = createFileRoute("/viewings")({
  head: () => ({ meta: [{ title: "Viewings" }] }),
  component: ViewingsPage,
});

function ViewingsPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const [status, setStatus] = useState<string>("");
  // The database already limits the list to the viewings this person may see (their own, ones they booked,
  // and ones for leads they can open), so the page does not narrow it again unless asked.
  const [mineOnly, setMineOnly] = useState(false);
  const { data: viewings = [] } = useViewings({
    status: status || undefined,
    agentId: mineOnly ? teamMember?.id : undefined,
  });
  const canCreate = can("viewings", "create");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<(typeof viewings)[number] | null>(null);
  const agentName = (id: string | null) => team.find((m) => m.id === id)?.full_name ?? "-";

  return (
    <AppShell>
      <PermissionGate module="viewings" action="view" page>
        <PageHeader
          eyebrow="Schedule"
          title="Viewings"
          description="Property viewing appointments across leads."
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setScheduleOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Schedule viewing
              </Button>
            ) : undefined
          }
        />

        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              className="h-8 w-44 text-xs"
              value={status || null}
              onChange={(v) => setStatus(v ?? "")}
              options={VIEWING_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
              emptyLabel="All statuses"
              aria-label="Filter by status"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Assigned to me only
            </label>
          </div>
        </Card>

        <DataTable
          columns={["Date and time", "Lead", "Property", "Agent", "Status", "Location", "Actions"]}
          empty={
            <EmptyState
              icon={<CalendarCheck2 className="h-4 w-4" />}
              title="No viewings scheduled"
              description="Schedule a viewing here, or from a lead or property profile."
            />
          }
        >
          {viewings.map((v) => (
            <tr key={v.id} className="border-b border-border last:border-0 transition-colors hover:bg-qbay-tint/60">
              <td className="px-4 py-3 text-xs tabular-nums">{fmtQatarDateTime(v.scheduled_at)}</td>
              <td className="px-4 py-3 text-sm font-medium">
                {v.lead_id ? (
                  <Link to="/leads/$leadId" params={{ leadId: v.lead_id }} className="hover:underline">
                    {v.leads?.full_name ?? "Lead"}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {v.property_id ? (
                  <Link to="/properties/$propertyId" params={{ propertyId: v.property_id }} className="hover:underline">
                    {propertyCodePrefix(v.properties)}
                    {v.properties?.title ?? "Property"}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No property linked</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">{agentName(v.assigned_agent_id)}</td>
              <td className="px-4 py-3 text-xs">
                <ViewingStatusBadge status={v.status} />
              </td>
              <td className="px-4 py-3 text-xs">
                {v.latitude && v.longitude ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {v.latitude.toFixed(3)}, {v.longitude.toFixed(3)}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    title="Open this viewing"
                    aria-label={`Open viewing on ${fmtQatarDateTime(v.scheduled_at)}`}
                    onClick={() => setDetailId(v.id)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Open
                  </button>
                  {v.status === "completed" && (
                    <button className="rounded-md p-1.5 hover:bg-muted" title="Import information" aria-label="Import information from this viewing" onClick={() => setImportTarget(v)}>
                      <Import className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>

        <ScheduleViewingDrawer open={scheduleOpen} onOpenChange={setScheduleOpen} />
        <ViewingDetailDrawer viewingId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
        {importTarget && (
          <ImportViewingDialog open={!!importTarget} onOpenChange={(v) => !v && setImportTarget(null)} viewing={importTarget} />
        )}
      </PermissionGate>
    </AppShell>
  );
}
