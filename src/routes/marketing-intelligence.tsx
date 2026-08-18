import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Megaphone, Sparkles, Globe, ExternalLink, ChevronDown, ChevronUp, Search, Save, AlertCircle, Loader2, ListTodo, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import {
  useMarketReports, useGenerateMarketIntelligence,
  type MarketReport, type StrategyOutput, type BrandGapOutput, type FocusInput,
} from "@/hooks/use-market-intelligence";
import { useMarketSources } from "@/hooks/use-market-sources";
import { useBrandProfile, useSaveBrandProfile, useBrandSearch, type BrandProfile } from "@/hooks/use-brand-profile";
import { useCreateTask, useTasks, useUpdateTask } from "@/hooks/use-tasks";
import { fmtDate, type Task } from "@/lib/db";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/marketing-intelligence")({
  head: () => ({
    meta: [
      { title: "Marketing Intelligence" },
      { name: "description", content: "Objective-driven marketing strategy from real buyer conversations and online brand research." },
    ],
  }),
  component: MarketingIntelligencePage,
});

const OBJECTIVES = [
  { v: "customer_reach", l: "Increase customer reach" },
  { v: "luxury", l: "Attract luxury buyers" },
  { v: "qualified_leads", l: "Generate more qualified leads" },
  { v: "promote_area", l: "Promote a specific area" },
  { v: "promote_type", l: "Promote a specific property type" },
  { v: "investor", l: "Increase investor interest" },
  { v: "brand_trust", l: "Improve brand trust" },
  { v: "move_inventory", l: "Move slow inventory" },
  { v: "new_launch", l: "Support a new property launch" },
  { v: "custom", l: "Custom objective" },
];

const PERIODS = [
  { v: "week", l: "This week" },
  { v: "month", l: "This month" },
  { v: "90d", l: "Last 90 days" },
  { v: "custom", l: "Custom period" },
];

function MarketingIntelligencePage() {
  const { data: reports = [], isLoading } = useMarketReports();
  const { data: sources = [] } = useMarketSources();
  const generate = useGenerateMarketIntelligence();
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const [objective, setObjective] = useState("customer_reach");
  const [customObjective, setCustomObjective] = useState("");
  const [periodKind, setPeriodKind] = useState<"week"|"month"|"90d"|"custom">("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [focusLocation, setFocusLocation] = useState("");
  const [focusType, setFocusType] = useState("");
  const [focusSegment, setFocusSegment] = useState("");
  const [focusTopic, setFocusTopic] = useState("");
  const [showBrand, setShowBrand] = useState(false);

  const strategyReports = reports.filter((r) => r.status === "completed" && (r.output_json as any)?.mode !== "brand_gap");
  const brandGapReports = reports.filter((r) => r.status === "completed" && (r.output_json as any)?.mode === "brand_gap");
  const latestStrategy = strategyReports[0];
  const latestBrandGap = brandGapReports[0];

  const buildInput = (mode: "strategy"|"brand_gap"): FocusInput => ({
    mode, objective, custom_objective: customObjective || undefined,
    period: periodKind === "custom" ? { kind: "custom", start: customStart || new Date(Date.now() - 30*24*3600*1000).toISOString() } : { kind: periodKind },
    focus: {
      location: focusLocation || undefined, property_type: focusType || undefined,
      buyer_segment: focusSegment || undefined, topic: focusTopic || undefined,
    },
  });

  const runStrategy = async () => {
    try { await generate.mutateAsync(buildInput("strategy")); toast.success("Focused strategy generated"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const runBrandGap = async () => {
    try { await generate.mutateAsync(buildInput("brand_gap")); toast.success("Brand gap analysis generated"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AppShell>
      <PermissionGate module="marketing_intelligence" action="view" page>
      <PageHeader
        eyebrow="Marketing"
        title="Marketing & Brand Intelligence"
        description="Objective-driven strategy and brand gap analysis from real buyer signals."
      />

      {/* Focus selector */}
      <Card className="mb-4">
        <h4 className="text-sm font-semibold">Focus</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Primary objective">
            <select value={objective} onChange={(e) => setObjective(e.target.value)} className={selectCls}>
              {OBJECTIVES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </Field>
          <Field label="Analysis period">
            <select value={periodKind} onChange={(e) => setPeriodKind(e.target.value as any)} className={selectCls}>
              {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </Field>
          {objective === "custom" && (
            <Field label="Custom objective" className="md:col-span-2">
              <input value={customObjective} onChange={(e) => setCustomObjective(e.target.value)} placeholder="Describe what you want to achieve--¦" className={inputCls} />
            </Field>
          )}
          {periodKind === "custom" && (
            <Field label="Period start date">
              <input type="date" value={customStart.slice(0,10)} onChange={(e) => setCustomStart(new Date(e.target.value).toISOString())} className={inputCls} />
            </Field>
          )}
          <Field label="Location (optional)"><input value={focusLocation} onChange={(e) => setFocusLocation(e.target.value)} className={inputCls} placeholder="e.g. Lusail, West Bay" /></Field>
          <Field label="Property type (optional)"><input value={focusType} onChange={(e) => setFocusType(e.target.value)} className={inputCls} placeholder="e.g. apartment, villa" /></Field>
          <Field label="Buyer segment (optional)"><input value={focusSegment} onChange={(e) => setFocusSegment(e.target.value)} className={inputCls} placeholder="e.g. investors, end-users" /></Field>
          <Field label="Topic / campaign (optional)"><input value={focusTopic} onChange={(e) => setFocusTopic(e.target.value)} className={inputCls} placeholder="e.g. payment plans, off-plan launch" /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={runStrategy} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate Focused Strategy
          </Button>
          <Button onClick={runBrandGap} disabled={generate.isPending} variant="outline">
            <Search className="h-3.5 w-3.5" /> Run Brand Gap Analysis
          </Button>
        </div>
      </Card>

      {/* Brand profile */}
      <Card className="mb-4">
        <button onClick={() => setShowBrand((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2"><Globe className="h-4 w-4" /> Brand profile & online research</span>
          {showBrand ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showBrand && <BrandProfileSection />}
      </Card>

      {/* Strategy output */}
      {isLoading ? (
        <EmptyState title="Loading reports--¦" />
      ) : !latestStrategy ? (
        <EmptyState
          icon={<Megaphone className="h-4 w-4" />}
          title="No focused strategy yet"
          description="Pick an objective above and press Generate Focused Strategy."
        />
      ) : (
        <StrategyReportView report={latestStrategy} sourceById={sourceById} />
      )}

      {/* Brand gap output */}
      {latestBrandGap && (
        <div className="mt-6">
          <BrandGapView report={latestBrandGap} sourceById={sourceById} />
        </div>
      )}
      </PermissionGate>
    </AppShell>
  );
}

const selectCls = "w-full h-9 rounded-lg border border-border bg-canvas px-2 text-sm";
const inputCls = "w-full h-9 rounded-lg border border-border bg-canvas px-2 text-sm";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function BrandProfileSection() {
  const { data: existing } = useBrandProfile();
  const save = useSaveBrandProfile();
  const search = useBrandSearch();
  const { data: sources = [] } = useMarketSources();
  const brandSources = sources.filter((s) => s.query?.startsWith("brand:") || (s.raw as any)?.source_type === "brand");

  const [profile, setProfile] = useState<BrandProfile>(() => existing ?? {
    brand_name: "", website: "", social_handles: [], location: "", services: [], competitors: [],
  });
  // hydrate when existing loads
  useEffect(() => { if (existing) setProfile(existing); }, [existing]);

  const update = <K extends keyof BrandProfile>(k: K, v: BrandProfile[K]) => setProfile((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    try { await save.mutateAsync(profile); toast.success("Brand profile saved"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onSearch = async () => {
    if (!profile.brand_name.trim()) { toast.error("Brand name required"); return; }
    try {
      await save.mutateAsync(profile);
      const r = await search.mutateAsync(profile);
      toast.success(`${r.inserted} brand sources cached`);
      if (r.errors?.length) console.warn("brand-search partial errors", r.errors);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Brand name"><input value={profile.brand_name} onChange={(e) => update("brand_name", e.target.value)} className={inputCls} /></Field>
        <Field label="Website"><input value={profile.website} onChange={(e) => update("website", e.target.value)} className={inputCls} placeholder="example.com" /></Field>
        <Field label="Location"><input value={profile.location} onChange={(e) => update("location", e.target.value)} className={inputCls} placeholder="e.g. Doha, Qatar" /></Field>
        <Field label="Social handles (comma-separated)">
          <input value={profile.social_handles.join(", ")} onChange={(e) => update("social_handles", splitCsv(e.target.value))} className={inputCls} placeholder="@brand, @brand_official" />
        </Field>
        <Field label="Main services (comma-separated)">
          <input value={profile.services.join(", ")} onChange={(e) => update("services", splitCsv(e.target.value))} className={inputCls} placeholder="off-plan sales, leasing, advisory" />
        </Field>
        <Field label="Competitors (comma-separated)">
          <input value={profile.competitors.join(", ")} onChange={(e) => update("competitors", splitCsv(e.target.value))} className={inputCls} placeholder="competitor A, competitor B" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onSave} disabled={save.isPending}><Save className="h-3.5 w-3.5" /> Save profile</Button>
        <Button size="sm" onClick={onSearch} disabled={search.isPending || save.isPending}>
          {search.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search Your Brand Online
        </Button>
      </div>
      {brandSources.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Cached brand sources</p>
          <ul className="space-y-1.5">
            {brandSources.slice(0, 15).map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs">
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline truncate inline-flex items-center gap-1">
                    {s.title} <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-muted-foreground truncate">{s.publisher ?? ""} Â· {fmtDate(s.retrieved_at)}</p>
                  {s.summary && <p className="mt-1 text-foreground/80 line-clamp-2">{s.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function splitCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function StrategyReportView({ report, sourceById }: { report: MarketReport; sourceById: Map<string, any> }) {
  const o = report.output_json as StrategyOutput;
  if (!o || (o as any).mode === "brand_gap") return null;
  const labelText = o.label === "pattern_analysis" ? "Buyer Pattern Analysis" : "Early Buyer Signals";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pastel-blue p-4">
        <div>
          <p className="text-[11px] font-medium text-foreground/70">This period's focus</p>
          <p className="mt-0.5 text-sm font-semibold">{o.period_focus?.objective} Â· {o.period_focus?.period_label}</p>
          {o.period_focus?.topic && <p className="text-[11px] text-muted-foreground">Topic: {o.period_focus.topic}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Generated {fmtDate(report.created_at)} Â· {labelText} Â· {report.conversation_count} conversations Â· {report.lead_count} leads
          </p>
        </div>
        {o.label === "early_signals" && (
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-medium text-foreground/70">
            Requires more data --- treat as directional only
          </span>
        )}
      </div>

      {o.recommended_direction && (
        <Card className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommended direction</p>
          <p className="mt-1 text-sm leading-relaxed">{o.recommended_direction}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <h4 className="text-sm font-semibold">What buyers are saying</h4>
          {!o.buyer_language?.length ? <p className="mt-2 text-xs text-muted-foreground">No findings yet.</p> : (
            <ul className="mt-3 space-y-2">
              {o.buyer_language.slice(0,5).map((b, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <p>{b.finding}</p>
                  <EvidenceRefs refs={b.refs} tags={b.evidence_tags} sourceById={sourceById} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h4 className="text-sm font-semibold">Brand gaps</h4>
          {!o.brand_gaps?.length ? <p className="mt-2 text-xs text-muted-foreground">No notable gaps.</p> : (
            <ul className="mt-3 space-y-2">
              {o.brand_gaps.slice(0,3).map((g, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <p>{g.gap}</p>
                  <EvidenceRefs refs={g.refs} tags={g.evidence_tags} sourceById={sourceById} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-[16px] font-semibold">Campaign ideas</h3>
        {!o.campaign_ideas?.length ? <p className="text-xs text-muted-foreground">No campaign ideas yet.</p> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.campaign_ideas.slice(0,5).map((c, i) => (
              <Card key={i}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{c.angle}</p>
                  <AddToTasksButton
                    reportId={report.id}
                    sourceRef={`campaign:${i}`}
                    title={`Campaign: ${c.angle}`}
                    description={`Audience: ${c.audience}\nProblem: ${c.problem}\nChannel: ${c.channel} --- ${c.channel_reason}`}
                    refs={c.refs ?? []}
                    propertyRefs={c.related_property_refs ?? []}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">For {c.audience}</p>
                <p className="mt-2 text-xs"><span className="font-medium">Problem: </span>{c.problem}</p>
                <p className="mt-1 text-xs"><span className="font-medium">Channel: </span>{c.channel} <span className="text-muted-foreground">--- {c.channel_reason}</span></p>
                {c.related_property_refs?.length > 0 && (
                  <PropertyRefs refs={c.related_property_refs} />
                )}
                <EvidenceRefs refs={c.refs} tags={c.evidence_tags} sourceById={sourceById} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-[16px] font-semibold">Actions this week</h3>
        {!o.actions_this_week?.length ? <p className="text-xs text-muted-foreground">No actions yet.</p> : (
          <ul className="space-y-2">
            {o.actions_this_week.slice(0,5).map((a, i) => (
              <li key={i} className="rounded-md border border-border bg-canvas p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{a.action}</p>
                  <AddToTasksButton
                    reportId={report.id}
                    sourceRef={`action:${i}`}
                    title={a.action}
                    description={a.why}
                    refs={a.refs ?? []}
                    propertyRefs={[]}
                    source="weekly_action"
                  />
                </div>
                <p className="mt-1 text-muted-foreground">{a.why}</p>
                <EvidenceRefs refs={a.refs} tags={a.evidence_tags} sourceById={sourceById} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ExecutionTasksPanel reportId={report.id} />
    </>
  );
}

function BrandGapView({ report, sourceById }: { report: MarketReport; sourceById: Map<string, any> }) {
  const o = report.output_json as BrandGapOutput;
  if (!o || (o as any).mode !== "brand_gap") return null;
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4" />
        <h3 className="text-[16px] font-semibold">Brand gap analysis</h3>
        <span className="text-[11px] text-muted-foreground">{fmtDate(report.created_at)}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GapCard title="Current online positioning" text={o.current_online_positioning} />
        <GapCard title="Buyer perception" text={o.buyer_perception} />
        <GapCard title="Positioning gap" text={o.positioning_gap} accent />
        <GapCard title="Recommended positioning" text={o.recommended_positioning} accent />
      </div>
      <Card className="mt-3">
        <h4 className="text-sm font-semibold">Messaging changes</h4>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs md:grid-cols-2">
          <KV k="Website headline" v={o.messaging_changes?.website_headline} />
          <KV k="Campaign angle" v={o.messaging_changes?.campaign_angle} />
          <KV k="Social content direction" v={o.messaging_changes?.social_direction} />
          <KV k="Sales talking point" v={o.messaging_changes?.sales_talking_point} />
          <KV k="Trust signal to add" v={o.messaging_changes?.trust_signal_to_add} />
          <KV k="Missing information" v={o.messaging_changes?.missing_information} />
        </dl>
      </Card>
      <Card className="mt-3">
        <h4 className="text-sm font-semibold">Distribution recommendation</h4>
        {!o.distribution_recommendation?.length ? <p className="mt-2 text-xs text-muted-foreground">No channels recommended.</p> : (
          <ul className="mt-3 space-y-2">
            {o.distribution_recommendation.map((d, i) => (
              <li key={i} className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium">{d.channel}</p>
                <p className="text-muted-foreground">{d.reason}</p>
                <EvidenceRefs refs={d.refs} tags={d.evidence_tags} sourceById={sourceById} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function GapCard({ title, text, accent }: { title: string; text?: string; accent?: boolean }) {
  return (
    <Card className={cn(accent && "bg-pastel-cream/60")}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm">{text || "---"}</p>
    </Card>
  );
}

function KV({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-sm">{v && v !== "" ? v : "---"}</span>
    </div>
  );
}

function PropertyRefs({ refs }: { refs: string[] }) {
  const propIds = refs.filter((r) => r.startsWith("property:")).map((r) => r.replace("property:", ""));
  if (propIds.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {propIds.slice(0,4).map((id) => (
        <Link key={id} to="/properties/$propertyId" params={{ propertyId: id }}
          className="inline-flex items-center gap-0.5 rounded-md bg-pastel-purple px-1.5 py-0.5 text-[10px] hover:underline">
          property <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      ))}
    </div>
  );
}

const TAG_TONE: Record<string, string> = {
  internal_buyer: "bg-pastel-blue",
  property_demand: "bg-pastel-purple",
  online_brand: "bg-pastel-cream",
  external_market: "bg-pastel-green",
};

function EvidenceRefs({ refs = [], tags = [], sourceById }: { refs?: string[]; tags?: string[]; sourceById: Map<string, any> }) {
  if (!refs.length && !tags.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      {tags.map((t) => (
        <span key={t} className={cn("rounded-md px-1.5 py-0.5 text-foreground", TAG_TONE[t] ?? "bg-muted")}>{t.replace("_"," ")}</span>
      ))}
      {refs.slice(0, 6).map((r) => {
        if (r.startsWith("source:")) {
          const s = sourceById.get(r.replace("source:", ""));
          if (s) return (
            <a key={r} href={s.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-0.5 rounded-md bg-canvas border border-border px-1.5 py-0.5 text-foreground hover:underline">
              {s.publisher ?? "source"} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          );
        }
        if (r.startsWith("property:")) {
          const id = r.replace("property:", "");
          return (
            <Link key={r} to="/properties/$propertyId" params={{ propertyId: id }}
              className="inline-flex items-center gap-0.5 rounded-md bg-pastel-purple px-1.5 py-0.5 text-foreground hover:underline">
              property
            </Link>
          );
        }
        return <span key={r} className="rounded-md bg-muted px-1.5 py-0.5">{r}</span>;
      })}
      {tags.includes("external_market") && refs.every((r) => !r.startsWith("source:")) && (
        <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />unsourced</span>
      )}
    </div>
  );
}

/* --- Marketing -†’ Execution bridge --- */

const MARKETING_STATUSES = ["proposed", "approved", "in_progress", "completed"] as const;
type MarketingStatus = (typeof MARKETING_STATUSES)[number];

const STATUS_TONE: Record<MarketingStatus, string> = {
  proposed: "bg-muted text-foreground",
  approved: "bg-pastel-blue text-foreground",
  in_progress: "bg-pastel-purple text-foreground",
  completed: "bg-pastel-green text-foreground",
};

function AddToTasksButton({
  reportId, sourceRef, title, description, refs, propertyRefs, source = "campaign_idea",
}: {
  reportId: string;
  sourceRef: string;
  title: string;
  description: string;
  refs: string[];
  propertyRefs: string[];
  source?: "campaign_idea" | "weekly_action";
}) {
  const { data: existingTasks = [] } = useTasks();
  const create = useCreateTask();
  const already = existingTasks.find((t: any) => t.marketing_report_id === reportId && t.source_ref === sourceRef);

  const onClick = async () => {
    if (already) { toast.info("Already added"); return; }
    try {
      const leadIds = refs.filter((r) => r.startsWith("lead:")).map((r) => r.replace("lead:", ""));
      const propIds = [...propertyRefs, ...refs.filter((r) => r.startsWith("property:"))]
        .map((r) => r.replace("property:", "")).filter(Boolean);
      const sourceIds = refs.filter((r) => r.startsWith("source:")).map((r) => r.replace("source:", ""));
      const interactionIds = refs.filter((r) => r.startsWith("interaction:")).map((r) => r.replace("interaction:", ""));
      await create.mutateAsync({
        title,
        description,
        priority: "medium",
        status: "pending",
        task_type: "marketing",
        source,
        source_ref: sourceRef,
        marketing_report_id: reportId,
        lead_id: leadIds[0] ?? null,
        property_id: propIds[0] ?? null,
        refs: { lead_ids: leadIds, property_ids: propIds, source_ids: sourceIds, interaction_ids: interactionIds, marketing_status: "proposed" },
      } as any);
      toast.success("Added to tasks");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Button size="sm" variant={already ? "outline" : "primary"} onClick={onClick} disabled={create.isPending}>
      {already ? <><CheckCircle2 className="h-3.5 w-3.5" /> Added</> : <><ListTodo className="h-3.5 w-3.5" /> Add as task</>}
    </Button>
  );
}

function ExecutionTasksPanel({ reportId }: { reportId: string }) {
  const { data: allTasks = [] } = useTasks();
  const update = useUpdateTask();
  const tasks = (allTasks as any[]).filter((t) => t.marketing_report_id === reportId);
  if (tasks.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-[16px] font-semibold">Execution --- tasks from this report</h3>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const status: MarketingStatus = (t.refs?.marketing_status as MarketingStatus) ?? "proposed";
          const setStatus = async (s: MarketingStatus) => {
            try {
              await update.mutateAsync({
                id: t.id,
                patch: {
                  status: s === "completed" ? "completed" : s === "in_progress" ? "in_progress" : "pending",
                  completed_at: s === "completed" ? new Date().toISOString() : null,
                  refs: { ...(t.refs ?? {}), marketing_status: s },
                } as Partial<Task>,
              });
            } catch (e) { toast.error((e as Error).message); }
          };
          const refs = t.refs ?? {};
          return (
            <li key={t.id} className="rounded-md border border-border bg-canvas p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.description && <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_TONE[status])}>{status.replace("_", " ")}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="h-7 rounded-md border border-border bg-background px-2 text-[11px]"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as MarketingStatus)}
                >
                  {MARKETING_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
                {refs?.lead_ids?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {refs.lead_ids.slice(0, 3).map((id: string) => (
                      <Link key={id} to="/leads/$leadId" params={{ leadId: id }} className="rounded-md bg-pastel-blue px-1.5 py-0.5 text-[10px] hover:underline">lead</Link>
                    ))}
                  </div>
                )}
                {refs?.property_ids?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {refs.property_ids.slice(0, 3).map((id: string) => (
                      <Link key={id} to="/properties/$propertyId" params={{ propertyId: id }} className="rounded-md bg-pastel-purple px-1.5 py-0.5 text-[10px] hover:underline">property</Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

