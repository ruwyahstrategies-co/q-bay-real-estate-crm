import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";

export const Route = createFileRoute("/ai-insights")({
  head: () => ({ meta: [{ title: "AI Insights" }] }),
  component: AIInsightsPage,
});

const sections = [
  "Leads requiring attention",
  "High-intent buyers",
  "Leads losing interest",
  "Common objections",
  "Buyer motivation trends",
  "Preferred locations",
  "Budget distribution",
  "Property demand trends",
  "Recommended follow-ups",
  "Lost-deal patterns",
];

function AIInsightsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="AI Insights"
        description="AI-generated buyer intelligence appears here once analysis is enabled."
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Card key={s}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{s}</h4>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              No analysis available yet. Connect an AI provider and add data to
              generate insights.
            </p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
