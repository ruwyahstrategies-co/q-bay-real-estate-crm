import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck2, ClipboardList } from "lucide-react";
import { Card, Button } from "./ui-primitives";
import { EmptyState } from "./empty-state";
import { ScheduleViewingDrawer, ViewingDetailDrawer, ViewingStatusBadge } from "./viewing-drawers";
import { TaskDrawer } from "./task-drawer";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { usePropertyViewings } from "@/hooks/use-viewings";
import { useTasks } from "@/hooks/use-tasks";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import type { Task } from "@/lib/db";
import { titleCase } from "@/lib/utils";

type TaskRow = Task & { leads: { full_name: string } | null; team_members: { full_name: string } | null };

/** Every viewing booked for this property, from the same records the lead profile and calendar show. */
export function PropertyViewingsSection({ propertyId }: { propertyId: string }) {
  const { data: viewings = [], isLoading } = usePropertyViewings(propertyId);
  const { data: team = [] } = useTeamMembers();
  const { can } = usePermissions();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const agentName = (id: string | null) => team.find((m) => m.id === id)?.full_name ?? "Unassigned";

  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="h-4 w-4" />
          <h4 className="text-sm font-semibold">Viewings ({viewings.length})</h4>
        </div>
        {can("viewings", "create") && (
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
            Schedule viewing
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading...</p>
      ) : viewings.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No viewings booked for this property yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {viewings.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setDetailId(v.id)}
                aria-label={`Open viewing on ${fmtQatarDateTime(v.scheduled_at)}`}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-qbay-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="min-w-0">
                  <span className="block font-medium tabular-nums">{fmtQatarDateTime(v.scheduled_at)}</span>
                  <span className="block truncate text-muted-foreground">
                    {v.leads?.full_name ?? "Lead"} · {agentName(v.assigned_agent_id)}
                  </span>
                </span>
                <ViewingStatusBadge status={v.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ScheduleViewingDrawer open={scheduleOpen} onOpenChange={setScheduleOpen} defaultPropertyId={propertyId} />
      <ViewingDetailDrawer viewingId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </Card>
  );
}

/** Tasks linked to this property, with a shortcut to add one that is already connected to it. */
export function PropertyTasksSection({ propertyId, propertyTitle }: { propertyId: string; propertyTitle?: string }) {
  const { data: tasks = [], isLoading } = useTasks({ propertyId });
  const { can } = usePermissions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const rows = tasks as unknown as TaskRow[];

  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          <h4 className="text-sm font-semibold">Tasks ({rows.length})</h4>
        </div>
        {can("tasks", "create") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            Add task
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No tasks for this property" description="Tasks you add here are linked to this property." />
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
              <button
                type="button"
                className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => {
                  setEditing(t);
                  setDrawerOpen(true);
                }}
              >
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block truncate text-muted-foreground">
                  {t.due_at ? fmtQatarDateTime(t.due_at) : "No due date"} · {t.team_members?.full_name ?? "Unassigned"}
                  {t.leads?.full_name ? ` · ${t.leads.full_name}` : ""}
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-2">
                {t.lead_id && (
                  <Link to="/leads/$leadId" params={{ leadId: t.lead_id }} className="text-qbay hover:underline">
                    Lead
                  </Link>
                )}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{titleCase(t.status)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <TaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        task={editing}
        defaultPropertyId={propertyId}
        defaultTitle={propertyTitle ? `Follow up: ${propertyTitle}` : undefined}
        source="property"
        sourceRef={propertyId}
      />
    </Card>
  );
}
