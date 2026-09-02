import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, Users, Trophy, Timer, Building2, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
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
import { useViewings } from "@/hooks/use-viewings";
import { useOffers } from "@/hooks/use-offers";
import { useTransactions } from "@/hooks/use-transactions";
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

// Validated categorical palette (dataviz skill reference), fixed order, never cycled.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const AXIS_STYLE = { fontSize: 11, fill: "#898781" };
const GRID_STROKE = "#e1e0d9";

const RANGES = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "365", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

function weekKey(d: Date): string {
  const monday = new Date(d);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function weeklyBuckets(dates: string[], sinceFallbackDays: number): { week: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const k = weekKey(new Date(iso));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  const trimmed = keys.length > 0 ? keys : [weekKey(new Date(Date.now() - sinceFallbackDays * 86400000))];
  return trimmed.map((k) => ({
    week: new Date(k).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    count: counts.get(k) ?? 0,
  }));
}

function weeklySum(items: { date: string; value: number }[]): { week: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const { date, value } of items) {
    const k = weekKey(new Date(date));
    sums.set(k, (sums.get(k) ?? 0) + value);
  }
  return Array.from(sums.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, value]) => ({ week: new Date(k).toLocaleDateString(undefined, { day: "numeric", month: "short" }), value }));
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4 h-64">{children}</div>
    </Card>
  );
}

function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90");
  const since = useMemo(() => {
    if (range === "all") return null;
    return new Date(Date.now() - Number(range) * 24 * 3600 * 1000);
  }, [range]);
  const rangeDays = range === "all" ? 365 : Number(range);

  const { data: allLeads = [], isLoading } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: team = [] } = useTeamMembers();
  const { data: tasks = [] } = useTasks();
  const { data: interactions = [] } = useInteractions();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const { data: viewings = [] } = useViewings();
  const { data: offers = [] } = useOffers();
  const { data: transactions = [] } = useTransactions();

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

  // --- Period comparison: this range vs the immediately preceding equal-length range ---
  const prevRangeLeads = useMemo(() => {
    if (!since) return [];
    const prevSince = new Date(since.getTime() - rangeDays * 86400000);
    return allLeads.filter((l) => l.created_at && new Date(l.created_at) >= prevSince && new Date(l.created_at) < since);
  }, [allLeads, since, rangeDays]);
  const prevWon = prevRangeLeads.filter((l) => l.pipeline_stage === "won").length;
  const leadsDelta = since && prevRangeLeads.length > 0 ? Math.round(((leads.length - prevRangeLeads.length) / prevRangeLeads.length) * 100) : null;
  const wonDelta = since && prevWon > 0 ? Math.round(((won.length - prevWon) / prevWon) * 100) : null;

  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of activeLeads) map.set(l.pipeline_stage, (map.get(l.pipeline_stage) ?? 0) + 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ stage: stageLabelFrom(stages, key), count }));
  }, [activeLeads, stages]);

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) map.set(l.lead_source || "Unknown", (map.get(l.lead_source || "Unknown") ?? 0) + 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({ source, count }));
  }, [leads]);

  const classificationCounts = useMemo(() => {
    const labels: Record<string, string> = { buyer: "Buyer", renter: "Renter", investor: "Investor", commercial: "Commercial" };
    const map = new Map<string, number>();
    for (const l of leads) {
      const key = labels[l.classification ?? ""] ?? "Other";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([classification, count]) => ({ classification, count }));
  }, [leads]);

  const leadsOverTime = useMemo(() => weeklyBuckets(leads.map((l) => l.created_at).filter(Boolean) as string[], rangeDays), [leads, rangeDays]);

  const conversionTrend = useMemo(() => {
    const closed = leads.filter((l) => ["won", "lost"].includes(l.pipeline_stage));
    const byWeek = new Map<string, { won: number; total: number }>();
    for (const l of closed) {
      const k = weekKey(new Date(l.updated_at));
      const cur = byWeek.get(k) ?? { won: 0, total: 0 };
      cur.total += 1;
      if (l.pipeline_stage === "won") cur.won += 1;
      byWeek.set(k, cur);
    }
    return Array.from(byWeek.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ week: new Date(k).toLocaleDateString(undefined, { day: "numeric", month: "short" }), rate: Math.round((v.won / v.total) * 100) }));
  }, [leads]);

  const pipelineValueTrend = useMemo(
    () => weeklySum(openLeads.filter((l) => l.created_at).map((l) => ({ date: l.created_at!, value: l.budget_max ?? 0 }))),
    [openLeads],
  );

  const funnel = useMemo(() => {
    const enquiries = leads.length;
    const viewingsCount = viewings.filter((v) => inRange(v.created_at)).length;
    const offersCount = offers.filter((o) => inRange(o.created_at)).length;
    const closedCount = won.length;
    return [
      { stage: "Enquiry", count: enquiries },
      { stage: "Viewing", count: viewingsCount },
      { stage: "Offer", count: offersCount },
      { stage: "Closed", count: closedCount },
    ];
  }, [leads, viewings, offers, won, since]);

  const closedTransactions = useMemo(() => transactions.filter((t) => t.status === "closed" && inRange(t.closed_at)), [transactions, since]);
  const salesRentalsOverTime = useMemo(() => {
    const byWeek = new Map<string, { sale: number; rental: number }>();
    for (const t of closedTransactions) {
      if (!t.closed_at) continue;
      const k = weekKey(new Date(t.closed_at));
      const cur = byWeek.get(k) ?? { sale: 0, rental: 0 };
      if (t.transaction_type === "sale") cur.sale += 1;
      if (t.transaction_type === "rental") cur.rental += 1;
      byWeek.set(k, cur);
    }
    return Array.from(byWeek.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ week: new Date(k).toLocaleDateString(undefined, { day: "numeric", month: "short" }), ...v }));
  }, [closedTransactions]);

  const revenueTrend = useMemo(
    () => weeklySum(closedTransactions.filter((t) => t.closed_at).map((t) => ({ date: t.closed_at!, value: t.transaction_value ?? 0 }))),
    [closedTransactions],
  );

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
              <MetricCard
                label="Leads in range"
                value={leads.length}
                icon={<Users className="h-4 w-4" />}
                tone="purple"
                delta={leadsDelta == null ? undefined : `${leadsDelta >= 0 ? "+" : ""}${leadsDelta}% vs previous period`}
              />
              <MetricCard label="Conversion rate" value={`${conversionRate}%`} icon={<Trophy className="h-4 w-4" />} tone="green" />
              <MetricCard label="Avg. sales cycle" value={avgCycleDays == null ? "No closed deals" : `${avgCycleDays} days`} icon={<Timer className="h-4 w-4" />} tone="cream" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Deals won"
                value={won.length}
                tone="green"
                delta={wonDelta == null ? undefined : `${wonDelta >= 0 ? "+" : ""}${wonDelta}% vs previous period`}
              />
              <MetricCard label="Won value" value={fmtMoney(wonValue, "QAR")} tone="cream" />
              <MetricCard label="Avg. deal size" value={won.length ? fmtMoney(avgDeal, "QAR") : "n/a"} tone="blue" />
              <MetricCard label="Unassigned leads" value={unassigned} tone="purple" />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChartCard title="Leads over time" description="New leads created per week.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={leadsOverTime} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" name="Leads" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Conversion trend" description="Won % of closed leads per week.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={conversionTrend} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="rate" name="Conversion %" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Pipeline value trend" description="Open pipeline value created per week (QAR).">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pipelineValueTrend} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtMoney(v, "QAR")} />
                    <Line type="monotone" dataKey="value" name="Pipeline value" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Enquiry → Viewing → Offer → Closed" description="Funnel for the selected range.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={70} />
                    <Tooltip />
                    <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                      {funnel.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Pipeline distribution" description="Active leads by stage.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageCounts} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Leads by source" description="Where leads came from in this range.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceCounts} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="source" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Buyer vs Renter vs Investor vs Commercial" description="Lead classification breakdown.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classificationCounts} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="classification" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                      {classificationCounts.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Sales vs rentals over time" description="Closed transactions per week.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesRentalsOverTime} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="sale" name="Sales" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="rental" name="Rentals" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Revenue trend" description="Closed transaction value per week (QAR).">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrend} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtMoney(v, "QAR")} />
                    <Line type="monotone" dataKey="value" name="Revenue" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
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
