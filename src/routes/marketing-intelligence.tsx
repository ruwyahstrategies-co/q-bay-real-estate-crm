import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Megaphone, Sparkles, Lightbulb, Wrench, Target, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import {
  useMarketReports,
  useGenerateMarketIntelligence,
  type MarketReport,
  type MarketReportOutput,
} from "@/hooks/use-market-intelligence";
import { useMarketSources } from "@/hooks/use-market-sources";
import { fmtDate } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/marketing-intelligence")({
  head: () => ({
    meta: [
      { title: "Marketing Intelligence — Buyer Patterns" },
      { name: "description", content: "Aggregated marketing recommendations from real buyer conversations and market sources." },
    ],
  }),
  component: MarketingIntelligencePage,
});

function MarketingIntelligencePage() {
  const { data: reports = [], isLoading } = useMarketReports();
  const { data: sources = [] } = useMarketSources();
  const generate = useGenerateMarketIntelligence();

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const latest: MarketReport | undefined = reports.find((r) => r.status === "completed");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Marketing"
        title="Marketing & Brand Intelligence"
        description="Aggregated, anonymised buyer patterns combined with cited online market sources."
        actions={
          <Button
            onClick={async () => {
              try {
                await generate.mutateAsync();
                toast.success("Marketing intelligence generated");
              } catch (e) { toast.error((e as Error).message); }
            }}
            disabled={generate.isPending}
            size="sm"
          >
            <Sparkles className={cn("h-3.5 w-3.5", generate.isPending && "animate-pulse")} />
            {generate.isPending ? "Generating…" : "Generate Market Intelligence"}
          </Button>
        }
      />

      {isLoading ? (
        <EmptyState title="Loading reports…" />
      ) : !latest || !latest.output_json ? (
        <EmptyState
          icon={<Megaphone className="h-4 w-4" />}
          title="No marketing intelligence yet"
          description="Press Generate Market Intelligence to analyse anonymised buyer patterns from conversations, uploads and cached market sources."
        />
      ) : (
        <ReportView report={latest} sourceById={sourceById} />
      )}
    </AppShell>
  );
}

function ReportView({ report, sourceById }: { report: MarketReport; sourceById: Map<string, any> }) {
  const o = report.output_json!;
  const labelText = o.label === "pattern_analysis" ? "Buyer Pattern Analysis" : "Early Buyer Signals";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pastel-blue p-4">
        <div>
          <p className="text-[11px] font-medium text-foreground/70">Report scope</p>
          <p className="mt-0.5 text-sm font-semibold">{labelText}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Generated {fmtDate(report.created_at)} · {report.conversation_count} conversations across {report.lead_count} active leads
          </p>
        </div>
        {o.label === "early_signals" && (
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-medium text-foreground/70">
            Requires more data — treat as directional only
          </span>
        )}
      </div>

      {o.summary && (
        <Card className="mb-4">
          <p className="text-sm leading-relaxed text-foreground/90">{o.summary}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ListCard title="Common buyer needs" items={o.commonBuyerNeeds?.map((n) => `${n.need} (${n.supportCount})`) ?? []} />
        <ListCard title="Common objections" items={o.commonObjections?.map((n) => `${n.objection} (${n.supportCount})`) ?? []} />
        <ListCard title="Requested features" items={o.requestedFeatures ?? []} />
        <ListCard title="Growing interest" items={o.growingInterest?.map((g) => g.topic) ?? []} />
        <ListCard title="Reasons buyers lose interest" items={o.lostInterestReasons?.map((g) => g.reason) ?? []} />
        <ListCard title="Buyer language patterns" items={o.languagePatterns ?? []} />
        <ListCard title="What builds trust" items={o.trustBuilders ?? []} />
        <ListCard title="What creates hesitation" items={o.hesitationTriggers ?? []} />
        <ListCard title="Marketing gaps" items={o.marketingGaps?.map((g) => g.gap) ?? []} />
      </div>

      <Section icon={<Target className="h-4 w-4" />} title="Positioning improvements">
        {(o.positioningImprovements ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No positioning recommendations.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.positioningImprovements.map((p, idx) => (
              <RecommendationCard
                key={idx}
                finding={p.finding}
                evidence={p.evidence}
                recommendation={p.recommendation}
                confidence={p.confidence}
                refs={p.evidenceReferences}
                sourceById={sourceById}
              />
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Lightbulb className="h-4 w-4" />} title="Marketing ideas">
        {(o.marketingIdeas ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No marketing ideas yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.marketingIdeas.map((m, idx) => (
              <Card key={idx}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-pastel-purple px-2 py-0.5 text-[10px]">{m.format}</span>
                  <span className="text-[10px] text-muted-foreground">For {m.targetBuyer}</span>
                </div>
                <p className="text-sm font-semibold">{m.topic}</p>
                <p className="mt-1 text-xs text-foreground/80"><strong>Buyer problem:</strong> {m.buyerProblem}</p>
                <p className="mt-1 text-xs text-foreground/80"><strong>Pattern:</strong> {m.supportingPattern}</p>
                <EvidenceRefs refs={m.evidenceReferences} sourceById={sourceById} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Wrench className="h-4 w-4" />} title="Brand fixes">
        {(o.brandFixes ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No brand issues flagged.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.brandFixes.map((b, idx) => (
              <Card key={idx}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold">{b.issue}</p>
                  <ConfBadge level={b.confidence} />
                </div>
                <p className="text-[11px] text-muted-foreground">{b.supportCount} supporting signals</p>
                <p className="mt-2 text-xs"><strong>Why it matters:</strong> {b.whyItMatters}</p>
                <p className="mt-1 text-xs"><strong>Suggested correction:</strong> {b.correction}</p>
                <EvidenceRefs refs={b.evidenceReferences} sourceById={sourceById} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Megaphone className="h-4 w-4" />} title="Campaign opportunities">
        {(o.campaignOpportunities ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No opportunities yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.campaignOpportunities.map((c, idx) => (
              <Card key={idx}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold">{c.opportunity}</p>
                  <ConfBadge level={c.confidence} />
                </div>
                <p className="mt-2 text-xs">{c.recommendation}</p>
                <EvidenceRefs refs={[...(c.internalDemandRef ?? []), ...(c.externalSourceRefs ?? [])]} sourceById={sourceById} />
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-[16px] font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not enough data.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.slice(0, 8).map((it, idx) => (
            <li key={idx} className="text-foreground/85">• {it}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecommendationCard({
  finding, evidence, recommendation, confidence, refs, sourceById,
}: {
  finding: string;
  evidence: string;
  recommendation: string;
  confidence: "low" | "medium" | "high";
  refs: string[];
  sourceById: Map<string, any>;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{finding}</p>
        <ConfBadge level={confidence} />
      </div>
      <p className="text-xs text-foreground/80"><strong>Evidence:</strong> {evidence}</p>
      <p className="mt-1 text-xs text-foreground/80"><strong>Action:</strong> {recommendation}</p>
      <EvidenceRefs refs={refs} sourceById={sourceById} />
    </Card>
  );
}

function ConfBadge({ level }: { level: "low" | "medium" | "high" }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-medium",
      level === "high" ? "bg-pastel-green" : level === "medium" ? "bg-pastel-cream" : "bg-muted text-foreground/70",
    )}>{level}</span>
  );
}

function EvidenceRefs({ refs, sourceById }: { refs: string[]; sourceById: Map<string, any> }) {
  if (!refs?.length) return null;
  const sourceRefs = refs.filter((r) => r.startsWith("source:"));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      <span>Evidence:</span>
      {refs.slice(0, 8).map((r) => {
        if (r.startsWith("source:")) {
          const s = sourceById.get(r.replace("source:", ""));
          if (s) {
            return (
              <a key={r} href={s.url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-0.5 rounded-md bg-pastel-blue px-1.5 py-0.5 text-foreground hover:underline">
                {s.publisher ?? new URL(s.url).hostname} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            );
          }
        }
        return <span key={r} className="rounded-md bg-muted px-1.5 py-0.5">{r}</span>;
      })}
      {sourceRefs.length === 0 && refs.some((r) => r.includes("trend") || r.includes("market")) && (
        <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />unsourced</span>
      )}
    </div>
  );
}
