import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Flame,
  Target,
  AlertTriangle,
  UserPlus,
  MoreHorizontal,
  Inbox,
  ArrowRight,
  Activity,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Buyer Intelligence" },
      {
        name: "description",
        content:
          "Real-time view of buyer pipeline activity, intent and follow-ups.",
      },
    ],
  }),
  component: OverviewPage,
});

const ranges = ["7D", "30D", "3M", "6M", "1Y", "All"] as const;

function OverviewPage() {
  const [range, setRange] = useState<(typeof ranges)[number]>("30D");

  return (
    <AppShell>
      <p className="mb-3 text-[13px] font-medium text-muted-foreground">
        Buyer Intelligence
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pipeline card */}
        <div className="relative overflow-hidden rounded-2xl bg-pastel-blue p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] font-medium text-foreground/70">
                Active Pipeline
              </p>
              <h3 className="mt-3 text-[34px] font-semibold leading-none tracking-tight text-foreground">
                0
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Qualified Buyer Value
              </p>
            </div>
            <button aria-label="More" className="text-foreground/50">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 flex h-44 items-center justify-center rounded-xl border border-dashed border-white/60 bg-white/40 text-center">
            <div>
              <Activity className="mx-auto h-5 w-5 text-foreground/60" />
              <p className="mt-2 text-xs font-medium text-foreground">
                No pipeline activity yet
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Charts appear once leads progress through the pipeline.
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
                  r === range
                    ? "bg-foreground text-primary-foreground"
                    : "text-foreground/70 hover:bg-white/50",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Hot Leads"
            value="0"
            tone="purple"
            icon={<Flame className="h-4 w-4" />}
          />
          <MetricCard
            label="High Intent"
            value="0"
            tone="green"
            icon={<Target className="h-4 w-4" />}
          />
          <MetricCard
            label="At Risk"
            value="0"
            tone="cream"
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <MetricCard
            label="New Leads"
            value="0"
            tone="blue"
            icon={<UserPlus className="h-4 w-4" />}
          />
        </div>
      </div>

      {/* Lower area */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-foreground">
              Recent Buyer Activity
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                24h
              </Button>
              <Button variant="outline" size="sm">
                All stages
              </Button>
            </div>
          </div>

          <DataTable
            columns={[
              "Buyer",
              "Interested Property",
              "Intent Score",
              "Pipeline Stage",
              "Last Interaction",
              "Assigned Agent",
              "Action",
            ]}
            empty={
              <EmptyState
                compact
                icon={<Inbox className="h-4 w-4" />}
                title="No buyer activity has been recorded."
                description="Once leads engage, their latest interactions will appear here."
              />
            }
          />
        </div>

        {/* Promo card */}
        <div className="relative overflow-hidden rounded-2xl bg-sidebar p-6 text-white">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full border border-white/10" />
          <h3 className="relative text-[20px] font-semibold leading-snug">
            Turn buyer behaviour into decisions
          </h3>
          <p className="relative mt-3 max-w-xs text-sm text-white/65">
            Analyse conversations, preferences and objections before the next
            follow-up.
          </p>
          <Button
            variant="outline"
            className="relative mt-6 border-white/15 bg-white text-foreground hover:bg-white/90"
            size="sm"
          >
            Review AI Insights
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
