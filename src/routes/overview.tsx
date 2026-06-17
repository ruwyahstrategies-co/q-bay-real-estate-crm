import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Flame, Target, AlertTriangle, UserPlus, Inbox, ArrowRight, Activity } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { PipelineStageBadge } from "@/components/status-badge";
import { useLeads } from "@/hooks/use-leads";
import { useInteractions } from "@/hooks/use-interactions";
import { useAllCompletedAnalyses } from "@/hooks/use-ai-analyses";
import { fmtDate, fmtMoney, stageLabel } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Buyer Intelligence" },
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

  const activeLeads = leads.filter((l) => l.status === "active");
  const pipelineValue = activeLeads
    .filter((l) => !["won", "lost"].includes(l.pipeline_stage))
    .reduce((acc, l) => acc + (l.budget_max ?? 0), 0);

  const newLeadsCount = activeLeads.filter((l) => l.pipeline_stage === "new_lead").length;
  const recentLeads = activeLeads.slice(0, 7);
  const recentInteractions = interactions.slice(0, 5);
  const currency = activeLeads[0]?.currency ?? "QAR";

  return (
    <AppShell>
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
          <MetricCard label="Hot Leads" value="—" tone="purple" icon={<Flame className="h-4 w-4" />} />
          <MetricCard label="High Intent" value="—" tone="green" icon={<Target className="h-4 w-4" />} />
          <MetricCard label="At Risk" value="—" tone="cream" icon={<AlertTriangle className="h-4 w-4" />} />
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
    </AppShell>
  );
}
