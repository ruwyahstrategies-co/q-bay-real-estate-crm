import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, CalendarPlus, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/select-field";
import { DialogShell } from "@/components/overlay";
import { TaskDrawer } from "@/components/task-drawer";
import { TenancyDrawer } from "@/components/tenancy-drawer";
import { ScheduleViewingDrawer, ViewingDetailDrawer } from "@/components/viewing-drawers";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useViewings } from "@/hooks/use-viewings";
import { useTasks } from "@/hooks/use-tasks";
import { useAllOwnerContracts } from "@/hooks/use-owner-contracts";
import { useTenancies, useRentSchedule } from "@/hooks/use-property-management";
import { fmtMoney, type PropertyLease, type Task } from "@/lib/db";
import { fmtQatarTime, qatarDayKey } from "@/lib/qatar-time";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar" }] }),
  component: CalendarPage,
});

type EventType = "viewing" | "task" | "contract" | "tenancy" | "rent";

/** Every calendar entry carries the id of the record behind it, so opening it never depends on its label. */
type CalEvent = { key: string; date: string; label: string; type: EventType } & (
  | { type: "viewing"; viewingId: string }
  | { type: "task"; task: Task }
  | { type: "contract"; ownerId: string; ownerName: string; propertyTitle: string | null; propertyId: string | null; expiry: string }
  | { type: "tenancy"; leaseId: string; propertyId: string; tenant: string; propertyTitle: string | null; start: string | null; end: string; status: string }
  | { type: "rent"; leaseId: string; propertyId: string | null; propertyTitle: string | null; amount: number; currency: string; due: string; status: string }
);

const TYPE_COLOR: Record<EventType, string> = {
  viewing: "bg-pastel-blue",
  task: "bg-pastel-purple",
  contract: "bg-pastel-cream",
  tenancy: "bg-pastel-green",
  rent: "bg-muted",
};
/** Solid edge/dot tone per type, so chips and the legend stay legible on white. */
const TYPE_TONE: Record<EventType, string> = {
  viewing: "#6FA8DC",
  task: "#A58AD0",
  contract: "#D6B24A",
  tenancy: "#4FA374",
  rent: "#94A3B8",
};
const TYPE_LABEL: Record<EventType, string> = {
  viewing: "Viewing",
  task: "Follow-Up",
  contract: "Owner Contract Expiry",
  tenancy: "Tenancy Expiry",
  rent: "Rent Due",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** YYYY-MM-DD for a calendar cell. Built from the cell's own year / month / day, with no timezone conversion. */
function cellKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const canViewAll = can("staff_activity", "view_all") || can("staff_activity", "view_team");

  const [scope, setScope] = useState<string>("me");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const { data: viewings = [] } = useViewings();
  const { data: tasks = [] } = useTasks();
  const { data: contracts = [] } = useAllOwnerContracts();
  const { data: tenancies = [] } = useTenancies();
  const { data: rentSchedule = [] } = useRentSchedule();

  // What is open right now. Everything is opened by record id.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [taskDrawer, setTaskDrawer] = useState<{ open: boolean; task: Task | null; dueLocal?: string }>({ open: false, task: null });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [info, setInfo] = useState<CalEvent | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const scopedAgentId = scope === "org" ? null : scope === "me" ? (teamMember?.id ?? null) : scope;

  const events = useMemo(() => {
    const list: CalEvent[] = [];
    for (const v of viewings) {
      if (scopedAgentId && v.assigned_agent_id !== scopedAgentId) continue;
      list.push({
        key: `viewing:${v.id}`,
        date: qatarDayKey(v.scheduled_at),
        label: `${fmtQatarTime(v.scheduled_at)} ${v.leads?.full_name ?? "Viewing"}${v.status === "cancelled" ? " (cancelled)" : ""}`,
        type: "viewing",
        viewingId: v.id,
      });
    }
    for (const t of tasks) {
      if (!t.due_at) continue;
      if (scopedAgentId && t.assigned_to !== scopedAgentId) continue;
      list.push({ key: `task:${t.id}`, date: qatarDayKey(t.due_at), label: t.title, type: "task", task: t });
    }
    for (const c of contracts) {
      if (scopedAgentId && c.assigned_agent_id !== scopedAgentId) continue;
      if (!c.expiry_date) continue;
      list.push({
        key: `contract:${c.id}`,
        date: c.expiry_date,
        label: `${c.owners?.name ?? "Owner"} contract expires`,
        type: "contract",
        ownerId: c.owner_id,
        ownerName: c.owners?.name ?? "Owner",
        propertyTitle: c.properties?.title ?? null,
        propertyId: c.property_id,
        expiry: c.expiry_date,
      });
    }
    for (const t of tenancies) {
      if (!t.lease_end) continue;
      const tenant = t.tenants?.full_name ?? t.tenant_name ?? "Tenancy";
      list.push({
        key: `tenancy:${t.id}`,
        date: t.lease_end,
        label: `${tenant} lease ends`,
        type: "tenancy",
        leaseId: t.id,
        propertyId: t.property_id,
        tenant,
        propertyTitle: t.properties?.title ?? null,
        start: t.lease_start,
        end: t.lease_end,
        status: t.status,
      });
    }
    for (const r of rentSchedule) {
      if (r.status === "paid") continue;
      list.push({
        key: `rent:${r.id}`,
        date: r.due_date,
        label: `Rent due · ${r.property_leases?.properties?.title ?? "Property"}`,
        type: "rent",
        leaseId: r.property_lease_id,
        propertyId: r.property_leases?.property_id ?? null,
        propertyTitle: r.property_leases?.properties?.title ?? null,
        amount: r.amount,
        currency: r.currency,
        due: r.due_date,
        status: r.status,
      });
    }
    return list;
  }, [viewings, tasks, contracts, tenancies, rentSchedule, scopedAgentId]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = qatarDayKey(Date.now());
  const lease = leaseId ? ((tenancies.find((t) => t.id === leaseId) as unknown as PropertyLease | undefined) ?? null) : null;

  function openEvent(e: CalEvent) {
    setDayOpen(null);
    if (e.type === "viewing") setViewingId(e.viewingId);
    else if (e.type === "task") setTaskDrawer({ open: true, task: e.task });
    else setInfo(e);
  }

  const dayEvents = dayOpen ? (eventsByDay.get(dayOpen) ?? []) : [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Viewings, follow-ups, owner contract and tenancy expiry, and rent due dates. Select an entry to open it."
        actions={
          <>
            {canViewAll && (
              <SelectField
                value={scope}
                onChange={(v) => setScope(v ?? "me")}
                options={[
                  { value: "me", label: "My Calendar" },
                  { value: "org", label: "Organisation" },
                  ...team.map((m) => ({ value: m.id, label: m.full_name })),
                ]}
                allowClear={false}
                className="w-48"
                aria-label="Whose calendar"
              />
            )}
            {can("viewings", "create") && (
              <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
                <CalendarPlus className="h-3.5 w-3.5" /> Schedule viewing
              </Button>
            )}
            {can("tasks", "create") && (
              <Button size="sm" onClick={() => setTaskDrawer({ open: true, task: null })}>
                <Plus className="h-3.5 w-3.5" /> Add task
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="ml-2 text-base font-semibold">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-24 rounded-lg border border-transparent" />;
            const key = cellKey(d);
            const list = eventsByDay.get(key) ?? [];
            return (
              <div
                key={i}
                className={cn(
                  "group min-h-24 min-w-0 rounded-lg border border-border bg-canvas p-1.5 transition-colors hover:bg-background",
                  key === todayKey && "border-qbay/50 bg-qbay-tint hover:bg-qbay-tint",
                )}
              >
                <div className="flex items-center justify-between">
                  <p
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                      key === todayKey ? "bg-qbay font-semibold text-white" : "text-muted-foreground",
                    )}
                    aria-label={key === todayKey ? `${d.getDate()}, today` : undefined}
                  >
                    {d.getDate()}
                  </p>
                  {can("tasks", "create") && (
                    <button
                      type="button"
                      aria-label={`Add a task on ${d.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}
                      title="Add task on this day"
                      onClick={() => setTaskDrawer({ open: true, task: null, dueLocal: `${key}T09:00` })}
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {list.slice(0, 3).map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => openEvent(e)}
                      title={`${TYPE_LABEL[e.type]}: ${e.label}`}
                      aria-label={`${TYPE_LABEL[e.type]}: ${e.label}, ${key}`}
                      className={cn(
                        "block w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[10px] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        TYPE_COLOR[e.type],
                      )}
                      style={{ borderLeftColor: TYPE_TONE[e.type] }}
                    >
                      {e.label}
                    </button>
                  ))}
                  {list.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setDayOpen(key)}
                      className="text-[10px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      +{list.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold">Legend</h4>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {(Object.keys(TYPE_LABEL) as EventType[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_TONE[t] }} /> {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      </Card>

      {events.length === 0 && <EmptyState icon={<CalendarDays className="h-4 w-4" />} title="Nothing scheduled" description="Viewings, follow-ups and expiries will show here." />}

      {/* Records open by id */}
      <ViewingDetailDrawer viewingId={viewingId} open={!!viewingId} onOpenChange={(v) => !v && setViewingId(null)} />
      <TaskDrawer
        open={taskDrawer.open}
        onOpenChange={(v) => !v && setTaskDrawer({ open: false, task: null })}
        task={taskDrawer.task}
        defaultDueLocal={taskDrawer.dueLocal}
      />
      <ScheduleViewingDrawer open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <TenancyDrawer open={!!lease} onOpenChange={(v) => !v && setLeaseId(null)} lease={lease} />

      {/* All entries for one day */}
      <DialogShell open={!!dayOpen} onOpenChange={(v) => !v && setDayOpen(null)} widthClassName="max-w-md" ariaLabel="Entries for the day">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">{dayOpen}</h3>
            <button onClick={() => setDayOpen(null)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {dayEvents.map((e) => (
              <li key={e.key}>
                <button
                  type="button"
                  onClick={() => openEvent(e)}
                  className={cn("flex w-full items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left text-xs hover:opacity-80", TYPE_COLOR[e.type])}
                  style={{ borderLeftColor: TYPE_TONE[e.type] }}
                >
                  <span className="shrink-0 font-medium">{TYPE_LABEL[e.type]}</span>
                  <span className="truncate">{e.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogShell>

      {/* Contract expiry, tenancy expiry and rent due: summary with links to the real records */}
      <DialogShell open={!!info} onOpenChange={(v) => !v && setInfo(null)} widthClassName="max-w-md" ariaLabel="Calendar entry">
        {info && (
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[info.type]}</p>
                <h3 className="mt-0.5 text-base font-semibold">{info.label}</h3>
              </div>
              <button onClick={() => setInfo(null)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {info.type === "contract" && (
              <>
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>{info.ownerName}</dd>
                  <dt className="text-muted-foreground">Property</dt>
                  <dd>{info.propertyTitle ?? "-"}</dd>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{info.expiry}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/owners/$ownerId" params={{ ownerId: info.ownerId }}>
                    <Button size="sm">Open owner and contract</Button>
                  </Link>
                  {info.propertyId && (
                    <Link to="/properties/$propertyId" params={{ propertyId: info.propertyId }}>
                      <Button size="sm" variant="outline">
                        Open property
                      </Button>
                    </Link>
                  )}
                </div>
              </>
            )}

            {info.type === "tenancy" && (
              <>
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Tenant</dt>
                  <dd>{info.tenant}</dd>
                  <dt className="text-muted-foreground">Property</dt>
                  <dd>{info.propertyTitle ?? "-"}</dd>
                  <dt className="text-muted-foreground">Lease</dt>
                  <dd>
                    {info.start ?? "?"} to {info.end}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{titleCase(info.status)}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setLeaseId(info.leaseId);
                      setInfo(null);
                    }}
                  >
                    Open tenancy
                  </Button>
                  <Link to="/properties/$propertyId" params={{ propertyId: info.propertyId }}>
                    <Button size="sm" variant="outline">
                      Open property
                    </Button>
                  </Link>
                </div>
              </>
            )}

            {info.type === "rent" && (
              <>
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Property</dt>
                  <dd>{info.propertyTitle ?? "-"}</dd>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="tabular-nums">{fmtMoney(info.amount, info.currency)}</dd>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd>{info.due}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{titleCase(info.status)}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setLeaseId(info.leaseId);
                      setInfo(null);
                    }}
                  >
                    Open tenancy
                  </Button>
                  {info.propertyId && (
                    <Link to="/properties/$propertyId" params={{ propertyId: info.propertyId }}>
                      <Button size="sm" variant="outline">
                        Open property
                      </Button>
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogShell>
    </AppShell>
  );
}
