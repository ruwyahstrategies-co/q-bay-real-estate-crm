import { createFileRoute } from "@tanstack/react-router";
import { Radar, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useStaffSessions, useMyOpenSession, useCheckIn, useCheckOut, useStaffActivityEvents } from "@/hooks/use-staff-activity";
import { fmtDateTime } from "@/lib/db";

export const Route = createFileRoute("/staff-activity")({
  head: () => ({ meta: [{ title: "Staff Activity" }] }),
  component: StaffActivityPage,
});

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((pos) => resolve(pos), () => resolve(null), { timeout: 5000 });
  });
}

function StaffActivityPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: openSession } = useMyOpenSession(teamMember?.id);
  const { data: sessions = [] } = useStaffSessions();
  const { data: events = [] } = useStaffActivityEvents();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const canViewAll = can("staff_activity", "view_all") || can("staff_activity", "view_team");

  async function handleCheckIn() {
    if (!teamMember) return;
    const pos = await getPosition();
    try {
      await checkIn.mutateAsync({ teamMemberId: teamMember.id, latitude: pos?.coords.latitude, longitude: pos?.coords.longitude });
      toast.success("Checked in");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleCheckOut() {
    if (!openSession) return;
    const pos = await getPosition();
    try {
      await checkOut.mutateAsync({ id: openSession.id, latitude: pos?.coords.latitude, longitude: pos?.coords.longitude });
      toast.success("Checked out");
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell>
      <PermissionGate module="staff_activity" action="view" page>
      <PageHeader eyebrow="Mobile-ready" title="Staff Activity" description="Check in/out and recent activity across the team." />

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Your status</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {openSession ? `Checked in at ${fmtDateTime(openSession.checked_in_at)}` : "Not checked in"}
            </p>
          </div>
          {openSession ? (
            <Button size="sm" variant="outline" onClick={handleCheckOut} disabled={checkOut.isPending}><LogOut className="h-3.5 w-3.5" /> Check out</Button>
          ) : (
            <Button size="sm" onClick={handleCheckIn} disabled={checkIn.isPending || !teamMember}><LogIn className="h-3.5 w-3.5" /> Check in</Button>
          )}
        </div>
      </Card>

      {canViewAll && (
        <>
          <h3 className="mb-3 text-[16px] font-semibold">Team sessions</h3>
          <DataTable
            columns={["Staff", "Checked in", "Checked out", "Location"]}
            empty={<EmptyState icon={<Radar className="h-4 w-4" />} title="No check-ins yet" />}
          >
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-background/60">
                <td className="px-4 py-3 text-sm font-medium">{(s as any).team_members?.full_name ?? "-"}</td>
                <td className="px-4 py-3 text-xs">{fmtDateTime(s.checked_in_at)}</td>
                <td className="px-4 py-3 text-xs">{s.checked_out_at ? fmtDateTime(s.checked_out_at) : "Active"}</td>
                <td className="px-4 py-3 text-xs">
                  {s.check_in_latitude ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {s.check_in_latitude.toFixed(3)}, {s.check_in_longitude?.toFixed(3)}</span>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </DataTable>

          <h3 className="mb-3 mt-6 text-[16px] font-semibold">Recent activity</h3>
          <DataTable
            columns={["When", "Event", "Details"]}
            empty={<EmptyState icon={<Radar className="h-4 w-4" />} title="No activity recorded yet" />}
          >
            {events.slice(0, 50).map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-background/60">
                <td className="px-4 py-3 text-xs">{fmtDateTime(e.occurred_at)}</td>
                <td className="px-4 py-3 text-xs capitalize">{e.event_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{[e.lead_id && "lead", e.property_id && "property", e.viewing_id && "viewing"].filter(Boolean).join(", ") || "-"}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
      </PermissionGate>
    </AppShell>
  );
}
