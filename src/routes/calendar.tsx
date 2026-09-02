import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/select-field";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useViewings } from "@/hooks/use-viewings";
import { useTasks } from "@/hooks/use-tasks";
import { useAllOwnerContracts } from "@/hooks/use-owner-contracts";
import { useTenancies, useRentSchedule } from "@/hooks/use-property-management";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar" }] }),
  component: CalendarPage,
});

type CalEvent = { date: string; label: string; type: "viewing" | "task" | "contract" | "tenancy" | "rent" };
const TYPE_COLOR: Record<CalEvent["type"], string> = {
  viewing: "bg-pastel-blue",
  task: "bg-pastel-purple",
  contract: "bg-pastel-cream",
  tenancy: "bg-pastel-green",
  rent: "bg-muted",
};
const TYPE_LABEL: Record<CalEvent["type"], string> = {
  viewing: "Viewing",
  task: "Follow-Up",
  contract: "Owner Contract Expiry",
  tenancy: "Tenancy Expiry",
  rent: "Rent Due",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function toDateKey(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function CalendarPage() {
  const { can } = usePermissions();
  const { teamMember } = useCurrentUser();
  const { data: team = [] } = useTeamMembers();
  const canViewAll = can("staff_activity", "view_all") || can("staff_activity", "view_team");

  const [scope, setScope] = useState<string>(teamMember?.id ?? "me");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const { data: viewings = [] } = useViewings();
  const { data: tasks = [] } = useTasks();
  const { data: contracts = [] } = useAllOwnerContracts();
  const { data: tenancies = [] } = useTenancies();
  const { data: rentSchedule = [] } = useRentSchedule();

  const scopedAgentId = scope === "org" ? null : scope === "me" ? teamMember?.id ?? null : scope;

  const events = useMemo(() => {
    const list: CalEvent[] = [];
    for (const v of viewings) {
      if (scopedAgentId && v.assigned_agent_id !== scopedAgentId) continue;
      list.push({ date: toDateKey(v.scheduled_at), label: `Viewing · ${v.status}`, type: "viewing" });
    }
    for (const t of tasks) {
      if (!t.due_at) continue;
      if (scopedAgentId && t.assigned_to !== scopedAgentId) continue;
      list.push({ date: toDateKey(t.due_at), label: t.title, type: "task" });
    }
    for (const c of contracts) {
      if (scopedAgentId && c.assigned_agent_id !== scopedAgentId) continue;
      if (!c.expiry_date) continue;
      list.push({ date: c.expiry_date, label: `${c.owners?.name ?? "Owner"} contract expires`, type: "contract" });
    }
    for (const t of tenancies) {
      if (!t.lease_end) continue;
      list.push({ date: t.lease_end, label: `${t.tenants?.full_name ?? t.tenant_name ?? "Tenancy"} lease ends`, type: "tenancy" });
    }
    for (const r of rentSchedule) {
      if (r.status === "paid") continue;
      list.push({ date: r.due_date, label: `Rent due · ${r.property_leases?.properties?.title ?? "Property"}`, type: "rent" });
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

  const todayKey = toDateKey(new Date());

  return (
    <AppShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Viewings, follow-ups, owner contract and tenancy expiry, and rent due dates."
        actions={
          canViewAll ? (
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
            />
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
          <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-20 rounded-md border border-transparent" />;
            const key = toDateKey(d);
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div key={i} className={cn("min-h-20 rounded-md border border-border p-1.5", key === todayKey && "border-foreground")}>
                <p className={cn("text-[11px]", key === todayKey && "font-semibold")}>{d.getDate()}</p>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e, ei) => (
                    <p key={ei} className={cn("truncate rounded px-1 py-0.5 text-[10px]", TYPE_COLOR[e.type])} title={e.label}>
                      {e.label}
                    </p>
                  ))}
                  {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold">Legend</h4>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {(Object.keys(TYPE_LABEL) as CalEvent["type"][]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", TYPE_COLOR[t])} /> {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      </Card>

      {events.length === 0 && <EmptyState icon={<CalendarDays className="h-4 w-4" />} title="Nothing scheduled" description="Viewings, follow-ups and expiries will show here." />}
    </AppShell>
  );
}
