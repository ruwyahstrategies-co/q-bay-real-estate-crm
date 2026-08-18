import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Sparkles, Flame, AlertTriangle, Target, TrendingUp, Inbox } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { useAllCompletedAnalyses } from "@/hooks/use-ai-analyses";
import { useLeads } from "@/hooks/use-leads";
import { stageLabel } from "@/lib/db";
import { AccessDenied } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";

export const Route = createFileRoute("/ai-insights")({
  head: () => ({ meta: [{ title: "AI Insights" }] }),
  component: AIInsightsPage,
});

function AIInsightsPage() {
  const { can } = usePermissions();
  const { data: analyses = [], isLoading } = useAllCompletedAnalyses();
  const { data: leads = [] } = useLeads({ status: "all" });

  // newest analysis per lead
  const currentByLead = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of analyses) if (!map.has(a.lead_id)) map.set(a.lead_id, a);
    return Array.from(map.values());
  }, [analyses]);

  const totalAnalysed = currentByLead.length;
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const getStatus = (a: any) => a.output_json?.deep_analysis?.buyer_status ?? a.output_json?.buyerStatus;
  const getIntent = (a: any) => a.output_json?.deep_analysis?.intent_score ?? a.output_json?.intentScore ?? 0;
  const getUrgency = (a: any) => a.output_json?.deep_analysis?.urgency ?? a.output_json?.urgency?.level;

  const hot = currentByLead.filter((a) => getStatus(a) === "hot");
  const atRisk = currentByLead.filter((a) => getStatus(a) === "at_risk");
  const highIntent = currentByLead.filter((a) => getIntent(a) >= 70);
  const highUrgency = currentByLead.filter((a) => {
    const u = getUrgency(a); return typeof u === "string" && /high|urgent|asap|immediate/i.test(u);
  });

  const painConcerns = (a: any) =>
    (a.output_json?.pain_points ?? []).map((p: any) => p.concern).filter(Boolean);
  const motiveLabels = (a: any) =>
    (a.output_json?.deep_analysis?.motivations ?? a.output_json?.motivations ?? []).map((m: any) => m.label).filter(Boolean);

  const objections = aggregateCounts(currentByLead.flatMap(painConcerns));
  const motivations = aggregateCounts(currentByLead.flatMap(motiveLabels));
  const locations = aggregateCounts(currentByLead.flatMap((a) => a.output_json?.buyer_summary?.preferred_locations ?? a.output_json?.propertyMatchingCriteria?.locations ?? []));
  const propertyTypes = aggregateCounts(currentByLead.flatMap((a) => [a.output_json?.buyer_summary?.property_type].filter(Boolean)));
  const recommendedStages = aggregateCounts(currentByLead.map((a) => a.output_json?.buyer_summary?.pipeline_stage ?? a.output_json?.recommendedPipelineStage).filter(Boolean));
  const missingCritical = currentByLead.filter((a) => (a.output_json?.wants?.missing_info?.length ?? a.output_json?.missingInformation?.length ?? 0) >= 2);

  if (!can("ai_insights", "view")) return <AppShell><AccessDenied /></AppShell>;

  if (isLoading) {
    return <AppShell><EmptyState title="Loading insights--¦" /></AppShell>;
  }

  if (totalAnalysed === 0) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Intelligence"
          title="AI Insights"
          description="AI-generated buyer intelligence appears here once leads have been analysed."
        />
        <EmptyState
          icon={<Sparkles className="h-4 w-4" />}
          title="No analysed buyer data yet"
          description="Open a lead and press Analyse Lead to generate buyer intelligence."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="AI Insights"
        description={`Aggregated from ${totalAnalysed} analysed lead${totalAnalysed === 1 ? "" : "s"}.`}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <LeadGroupCard icon={<Flame className="h-3.5 w-3.5" />} title="Hot buyers" rows={hot} leadById={leadById} emptyMsg="No hot leads yet." />
        <LeadGroupCard icon={<Target className="h-3.5 w-3.5" />} title="High intent (-‰¥70)" rows={highIntent} leadById={leadById} emptyMsg="No high-intent leads yet." showIntent />
        <LeadGroupCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="At risk" rows={atRisk} leadById={leadById} emptyMsg="No at-risk leads." />
        <LeadGroupCard icon={<TrendingUp className="h-3.5 w-3.5" />} title="High urgency" rows={highUrgency} leadById={leadById} emptyMsg="No high-urgency leads." />

        <CountCard title="Common pain points" entries={objections} threshold={1} />
        <CountCard title="Common motivations" entries={motivations} threshold={1} />
        <CountCard title="Preferred locations" entries={locations} threshold={1} />
        <CountCard title="Property type demand" entries={propertyTypes} threshold={1} />
        <CountCard title="Recommended pipeline stages" entries={recommendedStages} threshold={0} labelMap={stageLabel} />

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Leads missing critical information</h4>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{missingCritical.length}</span>
          </div>
          {missingCritical.length === 0 ? (
            <p className="text-xs text-muted-foreground">No critical gaps flagged.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {missingCritical.slice(0, 8).map((a) => {
                const lead = leadById.get(a.lead_id);
                const gaps = a.output_json?.wants?.missing_info?.length ?? a.output_json?.missingInformation?.length ?? 0;
                return (
                  <li key={a.id}>
                    <Link to="/leads/$leadId" params={{ leadId: a.lead_id }} className="hover:underline">
                      {lead?.full_name ?? a.lead_id}
                    </Link>
                    <span className="text-muted-foreground"> Â· {gaps} gaps</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function aggregateCounts(items: string[]) {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    const k = String(it).trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

function LeadGroupCard({
  icon, title, rows, leadById, emptyMsg, showIntent,
}: {
  icon: React.ReactNode; title: string; rows: any[]; leadById: Map<string, any>; emptyMsg: string; showIntent?: boolean;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">{icon}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.slice(0, 8).map((a) => {
            const lead = leadById.get(a.lead_id);
            return (
              <li key={a.id} className="flex items-center justify-between">
                <Link to="/leads/$leadId" params={{ leadId: a.lead_id }} className="hover:underline">
                  {lead?.full_name ?? a.lead_id}
                </Link>
                {showIntent && (
                  <span className="text-muted-foreground">Intent {a.output_json?.deep_analysis?.intent_score ?? a.output_json?.intentScore ?? "---"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function CountCard({
  title, entries, threshold, labelMap,
}: {
  title: string; entries: [string, number][]; threshold: number; labelMap?: (k: string) => string;
}) {
  const filtered = entries.filter(([, c]) => c >= threshold);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not enough data yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {filtered.slice(0, 8).map(([k, c]) => (
            <li key={k} className="flex items-center justify-between">
              <span>{labelMap ? labelMap(k) : k}</span>
              <span className="text-muted-foreground">{c}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
