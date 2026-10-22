import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, CalendarPlus, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/select-field";
import { SegmentedControl } from "@/components/segmented-control";
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
import {
  CALENDAR_VIEWS,
  addDays,
  compareEntries,
  dayHeading,
  daysForView,
  daysInMonth,
  minutesOf,
  monthStart,
  rangeLabel,
  stepCursor,
  type CalendarView,
} from "@/lib/calendar-view";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar" }] }),
  component: CalendarPage,
});

type EventType = "viewing" | "task" | "contract" | "tenancy" | "rent";

/** Every calendar entry carries the id of the record behind it, so opening it never depends on its label. */
type CalEvent = {
  key: string;
  date: string;
  /** Month cells show the time in front of the label. */
  label: string;
  /** The label without the time, for views that show the time in its own column. */
  shortLabel: string;
  /** "HH:mm" in Qatar time, or null for an all-day entry such as an expiry. */
  time: string | null;
  minutes: number | null;
  type: EventType;
} & (
  | { type: "viewing"; viewingId: string }
  | { type: "task"; task: Task }
  | {
      type: "contract";
      ownerId: string;
      ownerName: string;
      propertyTitle: string | null;
      propertyId: string | null;
      expiry: string;
    }
  | {
      type: "tenancy";
      leaseId: string;
      propertyId: string;
      tenant: string;
      propertyTitle: string | null;
      start: string | null;
      end: string;
      status: string;
    }
  | {
      type: "rent";
      leaseId: string;
      propertyId: string | null;
      propertyTitle: string | null;
      amount: number;
      currency: string;
      due: string;
      status: string;
    }
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
const ALL_TYPES = Object.keys(TYPE_LABEL) as EventType[];

function CalendarPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const canViewAll = can("staff_activity", "view_all") || can("staff_activity", "view_team");

  const [scope, setScope] = useState<string>("me");
  const todayKey = qatarDayKey(Date.now());
  const [view, setView] = useState<CalendarView>("month");
  const [cursorKey, setCursorKey] = useState(todayKey);
  const [hidden, setHidden] = useState<Set<EventType>>(new Set());

  // Phones open on the Agenda, which reads better than a seven column grid. A choice made afterwards sticks.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("agenda");
  }, []);

  const { data: viewings = [] } = useViewings();
  const { data: tasks = [] } = useTasks();
  const { data: contracts = [] } = useAllOwnerContracts();
  const { data: tenancies = [] } = useTenancies();
  const { data: rentSchedule = [] } = useRentSchedule();

  // What is open right now. Everything is opened by record id.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [taskDrawer, setTaskDrawer] = useState<{ open: boolean; task: Task | null; dueLocal?: string }>({
    open: false,
    task: null,
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [info, setInfo] = useState<CalEvent | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const scopedAgentId = scope === "org" ? null : scope === "me" ? (teamMember?.id ?? null) : scope;

  const events = useMemo(() => {
    const list: CalEvent[] = [];
    const timed = (iso: string) => {
      const time = fmtQatarTime(iso);
      return { time, minutes: minutesOf(time) };
    };
    for (const v of viewings) {
      if (scopedAgentId && v.assigned_agent_id !== scopedAgentId) continue;
      const t = timed(v.scheduled_at);
      const name = `${v.leads?.full_name ?? "Viewing"}${v.status === "cancelled" ? " (cancelled)" : ""}`;
      list.push({
        key: `viewing:${v.id}`,
        date: qatarDayKey(v.scheduled_at),
        label: `${t.time} ${name}`,
        shortLabel: name,
        ...t,
        type: "viewing",
        viewingId: v.id,
      });
    }
    for (const t of tasks) {
      if (!t.due_at) continue;
      if (scopedAgentId && t.assigned_to !== scopedAgentId) continue;
      list.push({
        key: `task:${t.id}`,
        date: qatarDayKey(t.due_at),
        label: t.title,
        shortLabel: t.title,
        ...timed(t.due_at),
        type: "task",
        task: t,
      });
    }
    for (const c of contracts) {
      if (scopedAgentId && c.assigned_agent_id !== scopedAgentId) continue;
      if (!c.expiry_date) continue;
      const label = `${c.owners?.name ?? "Owner"} contract expires`;
      list.push({
        key: `contract:${c.id}`,
        date: c.expiry_date,
        label,
        shortLabel: label,
        time: null,
        minutes: null,
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
      const label = `${tenant} lease ends`;
      list.push({
        key: `tenancy:${t.id}`,
        date: t.lease_end,
        label,
        shortLabel: label,
        time: null,
        minutes: null,
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
      const label = `Rent due · ${r.property_leases?.properties?.title ?? "Property"}`;
      list.push({
        key: `rent:${r.id}`,
        date: r.due_date,
        label,
        shortLabel: label,
        time: null,
        minutes: null,
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

  const typeCounts = useMemo(() => {
    const counts: Record<EventType, number> = { viewing: 0, task: 0, contract: 0, tenancy: 0, rent: 0 };
    for (const e of events) counts[e.type]++;
    return counts;
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (hidden.has(e.type)) continue;
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    for (const arr of map.values()) arr.sort(compareEntries);
    return map;
  }, [events, hidden]);

  const lease = leaseId
    ? ((tenancies.find((t) => t.id === leaseId) as unknown as PropertyLease | undefined) ?? null)
    : null;

  function openEvent(e: CalEvent) {
    setDayOpen(null);
    if (e.type === "viewing") setViewingId(e.viewingId);
    else if (e.type === "task") setTaskDrawer({ open: true, task: e.task });
    else setInfo(e);
  }

  function toggleType(t: EventType) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const dayEvents = dayOpen ? (eventsByDay.get(dayOpen) ?? []) : [];
  const canAddTask = can("tasks", "create");
  const addTaskOn = (key: string) => setTaskDrawer({ open: true, task: null, dueLocal: `${key}T09:00` });

  // Month grid cells, Monday first. Built from day keys so no browser time zone can move a day.
  const monthFirst = monthStart(cursorKey);
  const startOffset = (new Date(`${monthFirst}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monthCells: (string | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth(cursorKey) }, (_, i) => addDays(monthFirst, i)),
  ];
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  const listDays = view === "month" ? [] : daysForView(view, cursorKey);
  const agendaDays = view === "agenda" ? listDays.filter((d) => (eventsByDay.get(d)?.length ?? 0) > 0) : [];
  const visibleCount =
    view === "month"
      ? monthCells.reduce((n, d) => n + (d ? (eventsByDay.get(d)?.length ?? 0) : 0), 0)
      : listDays.reduce((n, d) => n + (eventsByDay.get(d)?.length ?? 0), 0);

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
            {canAddTask && (
              <Button size="sm" onClick={() => setTaskDrawer({ open: true, task: null })}>
                <Plus className="h-3.5 w-3.5" /> Add task
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg p-1.5 hover:bg-muted"
              onClick={() => setCursorKey(stepCursor(view, cursorKey, -1))}
              aria-label={`Previous ${view === "agenda" ? "30 days" : view}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg p-1.5 hover:bg-muted"
              onClick={() => setCursorKey(stepCursor(view, cursorKey, 1))}
              aria-label={`Next ${view === "agenda" ? "30 days" : view}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="ml-2 text-base font-semibold" aria-live="polite">
              {rangeLabel(view, cursorKey)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl<CalendarView>
              ariaLabel="Calendar view"
              size="md"
              value={view}
              onChange={(v) => {
                setView(v);
                // Agenda reads forward from the day you are on, so start it today when browsing a past month.
                if (v === "agenda" && cursorKey < todayKey && monthStart(cursorKey) === monthStart(todayKey)) {
                  setCursorKey(todayKey);
                }
              }}
              options={CALENDAR_VIEWS.map((v) => ({ value: v.value, label: v.label }))}
            />
            <Button variant="outline" size="sm" onClick={() => setCursorKey(todayKey)}>
              Today
            </Button>
          </div>
        </div>

        {view === "month" && (
          <>
            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {monthCells.map((key, i) => {
                if (!key) return <div key={i} className="min-h-24 rounded-lg border border-transparent" />;
                const dayNumber = Number(key.slice(8));
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
                      <button
                        type="button"
                        onClick={() => {
                          setCursorKey(key);
                          setView("day");
                        }}
                        title="Open this day"
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums hover:bg-muted",
                          key === todayKey ? "bg-qbay font-semibold text-white hover:bg-qbay" : "text-muted-foreground",
                        )}
                        aria-label={`Open ${key}${key === todayKey ? ", today" : ""}`}
                      >
                        {dayNumber}
                      </button>
                      {canAddTask && (
                        <button
                          type="button"
                          aria-label={`Add a task on ${key}`}
                          title="Add task on this day"
                          onClick={() => addTaskOn(key)}
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
          </>
        )}

        {(view === "week" || view === "day") && (
          <div className={cn("mt-4 grid gap-2", view === "week" ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1")}>
            {listDays.map((key) => (
              <DayColumn
                key={key}
                dayKey={key}
                isToday={key === todayKey}
                entries={eventsByDay.get(key) ?? []}
                onOpen={openEvent}
                onAdd={canAddTask ? () => addTaskOn(key) : undefined}
                wide={view === "day"}
              />
            ))}
          </div>
        )}

        {view === "agenda" && (
          <div className="mt-4 space-y-3">
            {agendaDays.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled in this 30 day window.
              </p>
            ) : (
              agendaDays.map((key) => (
                <DayColumn
                  key={key}
                  dayKey={key}
                  isToday={key === todayKey}
                  entries={eventsByDay.get(key) ?? []}
                  onOpen={openEvent}
                  onAdd={canAddTask ? () => addTaskOn(key) : undefined}
                  wide
                />
              ))
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Show</h4>
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Show everything
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {ALL_TYPES.map((t) => {
            const on = !hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:bg-muted",
                  on ? "border-border bg-canvas" : "border-dashed border-border text-muted-foreground line-through",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? TYPE_TONE[t] : "transparent", border: `1px solid ${TYPE_TONE[t]}` }} />
                {TYPE_LABEL[t]}
                <span className="tabular-nums text-muted-foreground">{typeCounts[t]}</span>
              </button>
            );
          })}
        </div>
        {events.length > 0 && visibleCount === 0 && view !== "agenda" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing in {rangeLabel(view, cursorKey)}
            {hidden.size > 0 ? " with the current selection." : "."}
          </p>
        )}
      </Card>

      {events.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="h-4 w-4" />}
          title="Nothing scheduled"
          description="Viewings, follow-ups and expiries will show here."
        />
      )}

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

/** One day's entries, in time order, for the Week, Day and Agenda views. */
function DayColumn({
  dayKey,
  isToday,
  entries,
  onOpen,
  onAdd,
  wide,
}: {
  dayKey: string;
  isToday: boolean;
  entries: CalEvent[];
  onOpen: (e: CalEvent) => void;
  onAdd?: () => void;
  wide?: boolean;
}) {
  return (
    <section
      aria-label={dayHeading(dayKey)}
      className={cn(
        "min-w-0 rounded-lg border border-border bg-canvas p-2",
        isToday && "border-qbay/50 bg-qbay-tint",
        !wide && "min-h-32",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <h5 className={cn("text-xs font-semibold", isToday && "text-qbay")}>
          {dayHeading(dayKey)}
          {isToday && <span className="ml-1.5 text-[10px] font-normal">Today</span>}
        </h5>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add a task on ${dayKey}`}
            title="Add task on this day"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                title={`${TYPE_LABEL[e.type]}: ${e.shortLabel}`}
                aria-label={`${TYPE_LABEL[e.type]}: ${e.time ?? "all day"} ${e.shortLabel}, ${dayKey}`}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-xs transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  TYPE_COLOR[e.type],
                )}
                style={{ borderLeftColor: TYPE_TONE[e.type] }}
              >
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{e.time ?? "All day"}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", wide ? "" : "truncate")}>{e.shortLabel}</span>
                  <span className="block text-[10px] text-muted-foreground">{TYPE_LABEL[e.type]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
