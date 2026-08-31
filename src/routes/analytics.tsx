import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, Users, Trophy, Timer, Building2, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { useTeamMembers } from "@/hooks/use-team";
import { useTasks } from "@/hooks/use-tasks";
import { useInteractions } from "@/hooks/use-interactions";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics" },
      { name: "description", content: "Live CRM analytics: pipeline value, conversion, agent performance and inventory health." },
      { property: "og:title", content: "Analytics" },
      { property: "og:description", content: "Live CRM analytics: pipeline value, conversion, agent performance and inventory health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "365", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90");
  const since = useMemo(() => {
    if (range === "all") return null;
    return new Date(Date.now() - Number(range) * 24 * 3600 * 1000);
  }, [range]);

  const { data: allLeads = [], isLoading } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: team = [] } = useTeamMembers();
  const { data: tasks = [] } = useTasks();
  const { data: interactions = [] } = useInteractions();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });

  const inRange = (iso: string | null | undefined) =>
    !since || (!!iso && new Date(iso).getTime() >= since.getTime());

  const leads = useMemo(() => allLeads.filter((l) => inRange(l.created_at)), [allLeads, since]);
  const activeLeads = leads.filter((l) => l.status === "active");
  const won = leads.filter((l) => l.pipeline_stage === "won");
  const lost = leads.filter((l) => l.pipeline_stage === "lost");
  const openLeads = activeLeads.filter((l) => !["won", "lost"].includes(l.pipeline_stage));

  const pipelineValue = openLeads.reduce((a, l) => a + (l.budget_max ?? 0), 0);
  const wonValue = won.reduce((a, l) => a + (l.budget_max ?? 0), 0);
  const closedTotal = won.length + lost.length;
  const conversionRate = closedTotal ? Math.round((won.length / closedTotal) * 100) : 0;
  const avgDeal = won.length ? Math.round(wonValue / won.length) : 0;

  const avgCycleDays = useMemo(() => {
    const durations = won
      .map((l) => (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000)
      .filter((d) => d >= 0);
    if (!durations.length) return null;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }, [won]);

  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of activeLeads) map.set(l.pipeline_stage, (map.get(l.pipeline_stage) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeLeads]);
  const stageMax = Math.max(1, ...stageCounts.map(([, n]) => n));

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) map.set(l.lead_source || "Unknown", (map.get(l.lead_source || "Unknown") ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [leads]);
  const sourceMax = Math.max(1, ...sourceCounts.map(([, n]) => n));

  const interactionsInRange = interactions.filter((i) => inRange(i.interaction_date));
  const tasksInRange = tasks.filter((t) => inRange(t.created_at));
  const completedTasks = tasksInRange.filter((t) => t.status === "completed");

  const agentRows = useMemo(() => {
    return team
      .filter((m) => m.is_active !== false)
      .map((m) => {
        const mine = leads.filter((l) => l.assigned_agent_id === m.id);
        const myWon = mine.filter((l) => l.pipeline_stage === "won");
        const myLost = mine.filter((l) => l.pipeline_stage === "lost");
        const closed = myWon.length + myLost.length;
        return {
          id: m.id,
          name: m.full_name,
          role: (m.role ?? "").replace(/_/g, " "),
          leads: mine.length,
          open: mine.filter((l) => l.status === "active" && !["won", "lost"].includes(l.pipeline_stage)).length,
          won: myWon.length,
          conversion: closed ? Math.round((myWon.length / closed) * 100) : 0,
          value: myWon.reduce((a, l) => a + (l.budget_max ?? 0), 0),
          openTasks: tasks.filter((t) => t.assigned_to === m.id && t.status !== "completed").length,
        };
      })
      .sort((a, b) => b.value - a.value || b.leads - a.leads);
  }, [team, leads, tasks]);

  const unassigned = activeLeads.filter((l) => !l.assigned_agent_id).length;
  const activeProperties = properties.filter((p) => p.status === "active");

  return (
    <AppShell>
      <PermissionGate module="analytics" action="view" page>
        <PageHeader
          eyebrow="Performance"
          title="Analytics"
          description="Live sales performance built from your leads, agents, properties and tasks."
          actions={
            <SelectField
              value={range}
              onChange={(v) => setRange((v ?? "90") as typeof range)}
              options={RANGES.map((r) => ({ value: r.key, label: r.label }))}
              allowClear={false}
              className="w-44"
              id="analytics-range"
            />
          }
        />

        {isLoading ? (
          <EmptyState title="Loading analytics..." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Open pipeline value" value={fmtMoney(pipelineValue, "QAR")} icon={<BarChart3 className="h-4 w-4" />} tone="blue" />
              <MetricCard label="Leads in range" value={leads.length} icon={<Users className="h-4 w-4" />} tone="purple" />
              <MetricCard label="Conversion rate" value={`${conversionRate}%`} icon={<Trophy className="h-4 w-4" />} tone="green" />
              <MetricCard label="Avg. sales cycle" value={avgCycleDays == null ? "No closed deals" : `${avgCycleDays} days`} icon={<Timer className="h-4 w-4" />} tone="cream" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Deals won" value={won.length} tone="green" />
              <MetricCard label="Won value" value={fmtMoney(wonValue, "QAR")} tone="cream" />
              <MetricCard label="Avg. deal size" value={won.length ? fmtMoney(avgDeal, "QAR") : "n/a"} tone="blue" />
              <MetricCard label="Unassigned leads" value={unassigned} tone="purple" />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <h4 className="text-sm font-semibold">Pipeline distribution</h4>
                <p className="text-xs text-muted-foreground">Active leads by stage.</p>
                {stageCounts.length === 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">No active leads in this range.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {stageCounts.map(([key, n]) => (
                      <li key={key} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-xs">{stageLabelFrom(stages, key)}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground" style={{ width: `${(n / stageMax) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <h4 className="text-sm font-semibold">Lead sources</h4>
                <p className="text-xs text-muted-foreground">Where leads came from in this range.</p>
                {sourceCounts.length === 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">No leads in this range.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {sourceCounts.map(([key, n]) => (
                      <li key={key} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-xs capitalize">{key}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(n / sourceMax) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard label="Interactions logged" value={interactionsInRange.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="blue" />
              <MetricCard
                label="Task completion"
                value={tasksInRange.length ? `${Math.round((completedTasks.length / tasksInRange.length) * 100)}%` : "n/a"}
                tone="green"
              />
              <MetricCard label="Active properties" value={`${activeProperties.length} of ${properties.length}`} icon={<Building2 className="h-4 w-4" />} tone="purple" />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Agent performance</h4>
              <DataTable
                columns={["Agent", "Role", "Leads", "Open", "Won", "Conversion", "Won value", "Open tasks"]}
                empty={<EmptyState compact title="No active team members" description="Add staff in the Team module to see performance." />}
              >
                {agentRows.length > 0
                  ? agentRows.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background/60">
                        <td className="px-4 py-3 text-sm font-medium">{r.name}</td>
                        <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{r.role || "Staff"}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{r.leads}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{r.open}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{r.won}</td>
                        <td className={cn("px-4 py-3 text-xs tabular-nums", r.conversion >= 50 && "font-semibold")}>{r.conversion}%</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{fmtMoney(r.value, "QAR")}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{r.openTasks}</td>
                      </tr>
                    ))
                  : null}
              </DataTable>
            </div>
          </div>
        )}
      </PermissionGate>
    </AppShell>
  );
}
