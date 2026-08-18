import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Flame, Target, AlertTriangle, UserPlus, Inbox, ArrowRight, Activity, BarChart3, Megaphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button, Card } from "@/components/ui-primitives";
import { PipelineStageBadge } from "@/components/status-badge";
import { useLeads } from "@/hooks/use-leads";
import { useInteractions } from "@/hooks/use-interactions";
import { useAllCompletedAnalyses } from "@/hooks/use-ai-analyses";
import { usePropertyEvents } from "@/hooks/use-property-events";
import { useProperties } from "@/hooks/use-properties";
import { useMarketReports } from "@/hooks/use-market-intelligence";
import { fmtDate, fmtMoney, stageLabel } from "@/lib/db";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/permission-gate";
import { useTasks } from "@/hooks/use-tasks";
import { APP_CONFIG } from "@/lib/config";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview" },
      { name: "description", content: "Real-time view of buyer pipeline activity, intent and follow-ups." },
    ],
  }),
  component: OverviewPage,
});

const ranges = ["7D", "30D", "3M", "6M", "1Y", "All"] as const;

function OverviewPage() {
  const [range, setRange] = useState<(typeof ranges)[number]>("30D");
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: interactions = [] } = useInteractions();
  const { data: completedAnalyses = [] } = useAllCompletedAnalyses();
  const { data: properties = [] } = useProperties({ status: "all" });
  const sinceISO = useMemo(() => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), []);
  const { data: events = [] } = usePropertyEvents(sinceISO);
  const { data: reports = [] } = useMarketReports();
  const { data: openTasks = [] } = useTasks({ status: "pending" });

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const now = Date.now();
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const upcomingTasks = openTasks
    .filter((t) => t.due_at && new Date(t.due_at).getTime() >= now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .slice(0, 6);

  const activeLeads = leads.filter((l) => l.status === "active");
  const pipelineValue = activeLeads
    .filter((l) => !["won", "lost"].includes(l.pipeline_stage))
    .reduce((acc, l) => acc + (l.budget_max ?? 0), 0);

  const newLeadsCount = activeLeads.filter((l) => l.pipeline_stage === "new_lead").length;
  const recentLeads = activeLeads.slice(0, 7);
  const recentInteractions = interactions.slice(0, 5);
  const currency = activeLeads[0]?.currency ?? "QAR";

  // Newest completed analysis per lead
  const currentByLead = new Map<string, any>();
  for (const a of completedAnalyses) if (!currentByLead.has(a.lead_id)) currentByLead.set(a.lead_id, a);
  const currents = Array.from(currentByLead.values());
  const getStatus = (a: any) => a.output_json?.deep_analysis?.buyer_status ?? a.output_json?.buyerStatus;
  const getIntent = (a: any) => a.output_json?.deep_analysis?.intent_score ?? a.output_json?.intentScore ?? 0;
  const hotCount = currents.filter((a) => getStatus(a) === "hot").length;
  const highIntentCount = currents.filter((a) => getIntent(a) >= 70).length;
  const atRiskCount = currents.filter((a) => getStatus(a) === "at_risk").length;

  // Demand signals
  const demandAgg = useMemo(() => {
    const perProp = new Map<string, { views: number; mentions: number; loc: string | null; type: string | null; score: number }>();
    const locCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    let topPriceOp: { pid: string; signal: number } | null = null;
    for (const e of events) {
      if (!e.property_id) continue;
      const p = propertyById.get(e.property_id);
      if (!p) continue;
      const cur = perProp.get(e.property_id) ?? { views: 0, mentions: 0, loc: p.location, type: p.property_type, score: 0 };
      cur.score += Number(e.weight ?? 1);
      if (e.event_type === "view") cur.views++;
      if (e.event_type === "mention") cur.mentions++;
      perProp.set(e.property_id, cur);
      if (p.location) locCounts.set(p.location, (locCounts.get(p.location) ?? 0) + Number(e.weight ?? 1));
      if (p.property_type) typeCounts.set(p.property_type, (typeCounts.get(p.property_type) ?? 0) + Number(e.weight ?? 1));
      const isStrong = ["enquiry","viewing_request","offer","shortlist"].includes(e.event_type);
      if (isStrong) {
        const cur2 = topPriceOp;
        const sig = cur.score;
        if (!cur2 || sig > cur2.signal) topPriceOp = { pid: e.property_id, signal: sig };
      }
    }
    const arr = Array.from(perProp.entries());
    const topViewed = arr.sort((a, b) => b[1].views - a[1].views)[0];
    const topMentioned = arr.sort((a, b) => b[1].mentions - a[1].mentions)[0];
    const topLoc = Array.from(locCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    return { topViewed, topMentioned, topLoc, topType, topPriceOp };
  }, [events, propertyById]);

  const latestReport = reports.find((r) => r.status === "completed");
  const reportOut = latestReport?.output_json;

  return (
    <AppShell>
      <PermissionGate module="overview" action="view" page>
      <p className="mb-3 text-[13px] font-medium text-muted-foreground">Buyer Intelligence</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-pastel-blue p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] font-medium text-foreground/70">Active Pipeline</p>
              <h3 className="mt-3 text-[34px] font-semibold leading-none tracking-tight text-foreground">
                {pipelineValue > 0 ? fmtMoney(pipelineValue, currency) : "0"}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">Qualified Buyer Value ({activeLeads.length} active leads)</p>
            </div>
          </div>

          <div className="mt-6 flex h-44 items-center justify-center rounded-xl border border-dashed border-white/60 bg-white/40 text-center">
            <div>
              <Activity className="mx-auto h-5 w-5 text-foreground/60" />
              <p className="mt-2 text-xs font-medium text-foreground">
                {activeLeads.length === 0 ? "No pipeline activity yet" : `${activeLeads.length} leads in pipeline`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Detailed charts will appear once enough activity has been recorded.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1">
            {ranges.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  r === range ? "bg-foreground text-primary-foreground" : "text-foreground/70 hover:bg-white/50",
                )}
              >{r}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Hot Leads" value={String(hotCount)} tone="purple" icon={<Flame className="h-4 w-4" />} />
          <MetricCard label="High Intent" value={String(highIntentCount)} tone="green" icon={<Target className="h-4 w-4" />} />
          <MetricCard label="At Risk" value={String(atRiskCount)} tone="cream" icon={<AlertTriangle className="h-4 w-4" />} />
          <MetricCard label="New Leads" value={String(newLeadsCount)} tone="blue" icon={<UserPlus className="h-4 w-4" />} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-foreground">Recent Buyer Activity</h3>
            <Link to="/leads"><Button variant="outline" size="sm">View all</Button></Link>
          </div>

          <DataTable
            columns={["Buyer", "Pipeline Stage", "Budget", "Last update", "Action"]}
            empty={
              <EmptyState compact icon={<Inbox className="h-4 w-4" />} title="No buyer activity has been recorded." description="Once leads engage, their latest interactions will appear here." />
            }
          >
            {recentLeads.length > 0
              ? recentLeads.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">
                      <Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.full_name}</Link>
                    </td>
                    <td className="px-4 py-3"><PipelineStageBadge stage={stageLabel(l.pipeline_stage)} /></td>
                    <td className="px-4 py-3 text-xs">{fmtMoney(l.budget_max, l.currency)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(l.updated_at)}</td>
                    <td className="px-4 py-3">
                      <Link to="/leads/$leadId" params={{ leadId: l.id }}>
                        <Button variant="outline" size="sm">Open</Button>
                      </Link>
                    </td>
                  </tr>
                ))
              : null}
          </DataTable>

          {recentInteractions.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-[16px] font-semibold">Recent interactions</h3>
              <div className="space-y-2">
                {recentInteractions.map((i) => (
                  <div key={i.id} className="rounded-lg border border-border bg-canvas px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{i.interaction_type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(i.interaction_date)}</span>
                    </div>
                    {i.subject && <p className="mt-1 text-xs text-muted-foreground">{i.subject}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-sidebar p-6 text-white">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full border border-white/10" />
          <h3 className="relative text-[20px] font-semibold leading-snug">Turn buyer behaviour into decisions</h3>
          <p className="relative mt-3 max-w-xs text-sm text-white/65">
            Analyse conversations, preferences and objections before the next follow-up.
          </p>
          <Link to="/ai-insights">
            <Button variant="outline" className="relative mt-6 border-white/15 bg-white text-foreground hover:bg-white/90" size="sm">
              Review AI Insights
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Follow-ups */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Overdue follow-ups</h3>
            <span className="rounded-full bg-[#FADCDA] px-2 py-0.5 text-[11px]">{overdueTasks.length}</span>
          </div>
          {overdueTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing overdue — you're on top of it.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {overdueTasks.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0">
                  <span className="truncate">{t.title}</span>
                  <span className="flex-shrink-0 text-muted-foreground">{fmtDate(t.due_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Upcoming follow-ups</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{upcomingTasks.length}</span>
          </div>
          {upcomingTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming follow-ups scheduled.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {upcomingTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0">
                  <span className="truncate">{t.title}</span>
                  <span className="flex-shrink-0 text-muted-foreground">{fmtDate(t.due_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Demand & Marketing signals */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <h3 className="text-[15px] font-semibold">Demand Signals</h3>
            </div>
            <Link to="/property-demand"><Button variant="outline" size="sm">Open<ArrowRight className="h-3 w-3" /></Button></Link>
          </div>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No property activity yet. Open property pages or import conversations to start tracking.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              <SignalRow label="Most viewed" value={demandAgg.topViewed ? propertyById.get(demandAgg.topViewed[0])?.title : null} extra={demandAgg.topViewed ? `${demandAgg.topViewed[1].views} views` : ""} />
              <SignalRow label="Most mentioned" value={demandAgg.topMentioned ? propertyById.get(demandAgg.topMentioned[0])?.title : null} extra={demandAgg.topMentioned ? `${demandAgg.topMentioned[1].mentions} mentions` : ""} />
              <SignalRow label="Top location" value={demandAgg.topLoc?.[0] ?? null} />
              <SignalRow label="Top property type" value={demandAgg.topType?.[0] ?? null} />
              <SignalRow label="Strongest pricing opportunity" value={demandAgg.topPriceOp ? propertyById.get(demandAgg.topPriceOp.pid)?.title : null} />
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              <h3 className="text-[15px] font-semibold">Marketing Signals</h3>
            </div>
            <Link to="/marketing-intelligence"><Button variant="outline" size="sm">Open<ArrowRight className="h-3 w-3" /></Button></Link>
          </div>
          {!reportOut ? (
            <p className="text-xs text-muted-foreground">No marketing intelligence report yet. Generate one to see patterns here.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              <SignalRow label="Top buyer signal" value={(reportOut as any).buyer_language?.[0]?.finding ?? null} />
              <SignalRow label="Brand gap" value={(reportOut as any).brand_gaps?.[0]?.gap ?? null} />
              <SignalRow label="Recommended direction" value={(reportOut as any).recommended_direction ?? null} />
              <SignalRow label="Top campaign idea" value={(reportOut as any).campaign_ideas?.[0]?.angle ?? null} />
            </ul>
          )}
        </Card>
      </div>
      </PermissionGate>
    </AppShell>
  );
}

function SignalRow({ label, value, extra }: { label: string; value: string | null | undefined; extra?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground/90">
        {value ?? <span className="text-muted-foreground">—</span>}
        {extra && <span className="ml-1 text-[10px] text-muted-foreground">({extra})</span>}
      </span>
    </li>
  );
}
