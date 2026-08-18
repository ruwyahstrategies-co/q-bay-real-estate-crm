import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, RefreshCw, Copy, MessageSquarePlus, ListTodo, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { useLeadAnalyses, useAnalyseLead, isSalesIntelligence, type AIAnalysis, type SalesIntelligenceOutput } from "@/hooks/use-ai-analyses";
import { useCreateInteraction } from "@/hooks/use-interactions";
import { useCreateTask } from "@/hooks/use-tasks";
import { useInteractions } from "@/hooks/use-interactions";
import { useUploads } from "@/hooks/use-uploads";
import { useProperties } from "@/hooks/use-properties";
import { fmtDateTime, stageLabel, type Lead } from "@/lib/db";
import { cn } from "@/lib/utils";

type Props = { lead: Lead };

const statusToneMap: Record<string, string> = {
  hot: "bg-pastel-purple text-foreground",
  warm: "bg-pastel-blue text-foreground",
  cold: "bg-muted text-foreground",
  at_risk: "bg-pastel-cream text-foreground",
  unclear: "bg-muted text-foreground",
};

export function BuyerIntelligencePanel({ lead }: Props) {
  const { data: analyses = [], isLoading } = useLeadAnalyses(lead.id);
  const { data: interactions = [] } = useInteractions({ leadId: lead.id });
  const { data: uploads = [] } = useUploads({ leadId: lead.id });
  const analyseMut = useAnalyseLead();

  const completed = analyses.filter((a) => a.status === "completed");
  const current = completed[0];
  const processing = analyses.find((a) => a.status === "processing");
  const failed = !current && analyses[0]?.status === "failed" ? analyses[0] : null;

  const latestSource = useMemo(() => {
    const times = [
      lead.updated_at,
      ...interactions.map((i) => i.updated_at ?? i.interaction_date),
      ...uploads.map((u) => u.updated_at ?? u.created_at),
    ].filter(Boolean).map((d) => new Date(d as string).getTime());
    return times.length ? Math.max(...times) : 0;
  }, [lead.updated_at, interactions, uploads]);

  // Outdated is the DB flag (set by triggers when any related data changes)
  // OR a heuristic fallback comparing source_updated_at to latest activity.
  const outdated = !!current && (
    (current as any).is_outdated === true
    || (current.source_updated_at
      ? new Date(current.source_updated_at).getTime() < latestSource - 1000
      : false)
  );
  const outdatedReason = (current as any)?.outdated_reason ?? null;

  const isProcessing = analyseMut.isPending || !!processing;

  const handleAnalyse = async () => {
    try {
      const res = await analyseMut.mutateAsync(lead.id);
      if (res.status === "completed") toast.success("Sales intelligence ready");
      else toast.error(res.error || "Analysis failed");
    } catch (e) { toast.error((e as Error).message); }
  };

  if (isLoading) return <EmptyState compact title="Loading analysis--¦" />;

  if (!current && !isProcessing && !failed) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Sales Intelligence not generated yet</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate a concise sales playbook tailored to this buyer.
            </p>
          </div>
          <Button onClick={handleAnalyse} disabled={isProcessing}>
            <Sparkles className="h-3.5 w-3.5" /> Generate
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" />
              : outdated ? <AlertCircle className="h-4 w-4" />
              : <CheckCircle2 className="h-4 w-4" />}
            <div>
              <p className="text-sm font-semibold">
                {isProcessing ? "Analysing--¦" : outdated ? "Sales intelligence outdated" : "Sales intelligence ready"}
              </p>
              <p className="text-xs text-muted-foreground">
                {current && <>Last run {fmtDateTime(current.created_at)} Â· Model {current.model ?? "---"}{outdated && ` Â· ${outdatedReason ? `Changed: ${outdatedReason.replace(/_/g, " ")}` : "New activity since this analysis"}. Regenerate to refresh.`}</>}
                {!current && failed && <>Last attempt failed: {failed.error_message}</>}
              </p>
            </div>
          </div>
          <Button onClick={handleAnalyse} disabled={isProcessing} variant={current ? "outline" : "primary"}>
            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {current ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </Card>

      {current && <SalesView lead={lead} analysis={current} />}
    </div>
  );
}

function SalesView({ lead, analysis }: { lead: Lead; analysis: AIAnalysis }) {
  const out = analysis.output_json as any;
  const createInteraction = useCreateInteraction();
  const createTask = useCreateTask();
  const { data: properties = [] } = useProperties({});
  const [deepOpen, setDeepOpen] = useState(false);

  if (!out) return <EmptyState compact title="Analysis output unavailable" />;
  if (!isSalesIntelligence(out)) {
    return (
      <Card>
        <p className="text-sm font-semibold">Previous analysis uses an older format.</p>
        <p className="mt-1 text-xs text-muted-foreground">Regenerate to view the new sales intelligence layout.</p>
      </Card>
    );
  }

  const s = out as SalesIntelligenceOutput;
  const propsById = new Map(properties.map((p) => [p.id, p]));

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  };

  const saveDraft = async (channel: "whatsapp"|"email", text: string) => {
    if (!text.trim()) return;
    try {
      await createInteraction.mutateAsync({
        lead_id: lead.id,
        interaction_type: channel,
        direction: "outbound",
        subject: `AI ${channel} draft`,
        content: text,
        interaction_date: new Date().toISOString(),
      });
      toast.success("Saved as interaction");
    } catch (e) { toast.error((e as Error).message); }
  };

  const createNextTask = async () => {
    if (!s.sales_playbook.next_action) return;
    try {
      await createTask.mutateAsync({
        lead_id: lead.id,
        title: s.sales_playbook.next_action,
        description: s.sales_playbook.call_strategy ?? null,
        priority: "high", status: "pending",
        due_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      });
      toast.success("Task created");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      {/* 1. WHO IS THIS BUYER */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Who is this buyer?</h4>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", statusToneMap[s.deep_analysis?.buyer_status ?? "unclear"] ?? "bg-muted")}>
            {(s.deep_analysis?.buyer_status ?? "unclear").replace("_"," ")}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs md:grid-cols-2">
          <KV k="Buyer type" v={s.buyer_summary.buyer_type} />
          <KV k="Budget" v={s.buyer_summary.budget} />
          <KV k="Preferred locations" v={s.buyer_summary.preferred_locations?.join(", ")} />
          <KV k="Property type" v={s.buyer_summary.property_type} />
          <KV k="Timeline" v={s.buyer_summary.timeline} />
          <KV k="Financing" v={s.buyer_summary.financing} />
          <KV k="Pipeline stage" v={stageLabel(s.buyer_summary.pipeline_stage)} />
          <KV k="Main motivation" v={s.buyer_summary.main_motivation} />
        </dl>
      </Card>

      {/* 2. WHAT DO THEY WANT */}
      <Card>
        <h4 className="text-sm font-semibold">What do they want?</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <ChipList title="Explicit requirements" items={s.wants.explicit_requirements} />
          <ChipList title="Must-have features" items={s.wants.must_haves} />
          <ChipList title="Preferences" items={s.wants.preferences} />
          <ChipList title="Rejected" items={s.wants.rejected} tone="rose" />
        </div>
        {s.wants.mentioned_properties?.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mentioned properties</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {s.wants.mentioned_properties.map((mp, i) => {
                const p = mp.property_id ? propsById.get(mp.property_id) : undefined;
                const label = p ? `${p.reference_code ?? ""} ${p.title}`.trim() : mp.label;
                return p ? (
                  <Link key={i} to="/properties/$propertyId" params={{ propertyId: p.id }}
                    className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-2 py-0.5 text-[11px] hover:underline">
                    {label} <span className="text-[10px] text-muted-foreground capitalize">Â· {mp.status}</span>
                  </Link>
                ) : (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{label} <span className="text-[10px] text-muted-foreground capitalize">Â· {mp.status}</span></span>
                );
              })}
            </ul>
          </div>
        )}
        {s.wants.missing_info?.length > 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-border p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Missing info to qualify accurately</p>
            <ul className="mt-1 text-xs text-foreground/85">
              {s.wants.missing_info.map((m, i) => <li key={i}>--¢ {m}</li>)}
            </ul>
          </div>
        )}
      </Card>

      {/* 3. WHAT SHOULD THE SALESPERSON SAY */}
      <Card>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">What should the salesperson say?</h4>
        </div>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-border bg-canvas p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next action</p>
            <p className="mt-1 text-sm font-medium">{s.sales_playbook.next_action || "---"}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={createNextTask}><ListTodo className="h-3.5 w-3.5" /> Create task</Button>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Call strategy</p>
            <p className="mt-1 text-xs">{s.sales_playbook.call_strategy || "---"}</p>
          </div>
          {s.sales_playbook.questions?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Questions to ask (max 3)</p>
              <ul className="mt-1 list-decimal pl-5 text-xs">
                {s.sales_playbook.questions.slice(0,3).map((q, i) => <li key={i} className="mt-0.5">{q}</li>)}
              </ul>
            </div>
          )}
          <DraftBox label="WhatsApp draft" channel="whatsapp" text={s.sales_playbook.whatsapp_draft} onCopy={copy} onSave={saveDraft} />
          <DraftBox label="Email draft" channel="email" text={s.sales_playbook.email_draft} onCopy={copy} onSave={saveDraft} />
          <div className="rounded-lg border border-border bg-canvas p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Objection-handling response</p>
            <p className="mt-1 text-xs whitespace-pre-wrap">{s.sales_playbook.objection_response || "---"}</p>
          </div>
        </div>
      </Card>

      {/* 4. PAIN POINTS */}
      <Card>
        <h4 className="text-sm font-semibold">Pain points to solve</h4>
        {s.pain_points.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No specific pain points surfaced from the conversations.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {s.pain_points.map((p, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{p.concern}</p>
                {p.evidence?.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">Evidence: {p.evidence.join(", ")}</p>
                )}
                <p className="mt-2 text-xs"><span className="font-medium">How to address: </span>{p.how_to_address}</p>
                <p className="mt-1 text-xs text-foreground/70"><span className="font-medium">Avoid: </span>{p.what_to_avoid}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 5. PROPERTY MATCHES */}
      <Card>
        <h4 className="text-sm font-semibold">Top 3 properties to send</h4>
        {s.property_matches.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No strong matches in current inventory.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {s.property_matches.slice(0,3).map((m, i) => {
              const p = propsById.get(m.property_id);
              return (
                <li key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p ? `${p.reference_code ?? ""} ${p.title}`.trim() : "Property"}</p>
                      <p className="text-xs text-muted-foreground">{m.price} Â· {m.availability}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-pastel-purple px-2 py-0.5 text-xs font-semibold">{m.match_percent}%</span>
                  </div>
                  {m.reasons?.length > 0 && <p className="mt-2 text-xs"><span className="font-medium">Why: </span>{m.reasons.join(", ")}</p>}
                  {m.conflicts?.length > 0 && <p className="mt-1 text-xs text-foreground/70"><span className="font-medium">Conflicts: </span>{m.conflicts.join(", ")}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p && (
                      <Link to="/properties/$propertyId" params={{ propertyId: p.id }}>
                        <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /> Open property</Button>
                      </Link>
                    )}
                    {p && (
                      <Button size="sm" variant="outline" onClick={() => copy("Property summary", `${p.title}\n${p.location ?? ""}\n${m.price}\n${m.reasons?.join(", ") ?? ""}`)}>
                        <Send className="h-3.5 w-3.5" /> Send to buyer
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* DEEP ANALYSIS (collapsed) */}
      <Card>
        <button onClick={() => setDeepOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
          <span>Deep analysis</span>
          {deepOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {deepOpen && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Intent" value={`${s.deep_analysis.intent_score ?? "---"}`} />
              <Metric label="Confidence" value={`${s.deep_analysis.confidence ?? "---"}`} />
              <Metric label="Urgency" value={s.deep_analysis.urgency || "---"} />
            </div>
            {s.deep_analysis.summary && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.deep_analysis.summary}</p>}
            {s.deep_analysis.motivations?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Motivations</p>
                <ul className="mt-1 space-y-1.5">
                  {s.deep_analysis.motivations.map((m, i) => (
                    <li key={i} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">{m.label}</p>
                      <p className="text-muted-foreground">{m.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.deep_analysis.risks?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Risks</p>
                <ul className="mt-1 space-y-1.5">
                  {s.deep_analysis.risks.map((r, i) => (
                    <li key={i} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">{r.label}</p>
                      <p className="text-muted-foreground">{r.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
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

function ChipList({ title, items, tone }: { title: string; items: string[]; tone?: "rose" }) {
  if (!items || items.length === 0) return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">---</p>
    </div>
  );
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li key={i} className={cn("rounded-full px-2 py-0.5 text-[11px]", tone === "rose" ? "bg-pastel-cream" : "bg-muted")}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function DraftBox({ label, channel, text, onCopy, onSave }: { label: string; channel: "whatsapp"|"email"; text: string; onCopy: (l: string, t: string) => void; onSave: (c: "whatsapp"|"email", t: string) => void }) {
  const [val, setVal] = useState(text || "");
  return (
    <div className="rounded-lg border border-border bg-canvas p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onCopy(label, val)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
          <Button size="sm" variant="ghost" onClick={() => onSave(channel, val)}><MessageSquarePlus className="h-3.5 w-3.5" /> Save</Button>
        </div>
      </div>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={channel === "email" ? 5 : 3}
        className="mt-2 w-full resize-y rounded-md border border-border bg-background p-2 text-xs"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-canvas p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
