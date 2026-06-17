import { useMemo, useState } from "react";
import { Sparkles, RefreshCw, Copy, MessageSquarePlus, ListTodo, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { useLeadAnalyses, useAnalyseLead, type AIAnalysis, type BuyerAnalysisOutput } from "@/hooks/use-ai-analyses";
import { useCreateInteraction } from "@/hooks/use-interactions";
import { useCreateTask } from "@/hooks/use-tasks";
import { useChangePipelineStage } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { useInteractions } from "@/hooks/use-interactions";
import { useUploads } from "@/hooks/use-uploads";
import { fmtDateTime, stageLabel, type Lead, fmtMoney } from "@/lib/db";
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

  // Outdated detection: any related source updated after analysis source_updated_at
  const latestSource = useMemo(() => {
    const times = [
      lead.updated_at,
      ...interactions.map((i) => i.updated_at ?? i.interaction_date),
      ...uploads.map((u) => u.updated_at ?? u.created_at),
    ].filter(Boolean).map((d) => new Date(d as string).getTime());
    return times.length ? Math.max(...times) : 0;
  }, [lead.updated_at, interactions, uploads]);

  const outdated =
    current && current.source_updated_at
      ? new Date(current.source_updated_at).getTime() < latestSource - 1000
      : false;

  const isProcessing = analyseMut.isPending || !!processing;

  const handleAnalyse = async () => {
    try {
      const res = await analyseMut.mutateAsync(lead.id);
      if (res.status === "completed") toast.success("Analysis complete");
      else toast.error(res.error || "Analysis failed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return <EmptyState compact title="Loading analysis…" />;
  }

  if (!current && !isProcessing && !failed) {
    return (
      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Buyer Intelligence not analysed yet</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Run an analysis to surface intent, motivations, objections, risks and next-best actions for this buyer.
              </p>
            </div>
            <Button onClick={handleAnalyse} disabled={isProcessing}>
              <Sparkles className="h-3.5 w-3.5" /> Analyse Lead
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-foreground" />
            ) : outdated ? (
              <AlertCircle className="h-4 w-4 text-foreground" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-foreground" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {isProcessing ? "Analysis in progress…" : outdated ? "Analysis outdated" : "Analysis current"}
              </p>
              <p className="text-xs text-muted-foreground">
                {current && (
                  <>
                    Last run {fmtDateTime(current.created_at)} · Model {current.model ?? "—"}
                    {outdated && " · Source information has changed since this analysis"}
                  </>
                )}
                {!current && failed && <>Last attempt failed: {failed.error_message}</>}
              </p>
            </div>
          </div>
          <Button onClick={handleAnalyse} disabled={isProcessing} variant={current ? "outline" : "primary"}>
            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {current ? "Reanalyse" : "Analyse Lead"}
          </Button>
        </div>
      </Card>

      {current && <AnalysisView lead={lead} analysis={current} />}
    </div>
  );
}

function AnalysisView({ lead, analysis }: { lead: Lead; analysis: AIAnalysis }) {
  const out = analysis.output_json as unknown as BuyerAnalysisOutput | null;
  const { data: properties = [] } = useProperties({ status: "active" });
  const createInteraction = useCreateInteraction();
  const createTask = useCreateTask();
  const changeStage = useChangePipelineStage();
  const [draftMsg, setDraftMsg] = useState(out?.followUpDraft?.message ?? "");

  if (!out) return <EmptyState compact title="Analysis output unavailable" />;

  const evidenceLabel = (ref: string) => resolveEvidenceLabel(ref, { interactions: [], uploads: [] });

  const stageMatches = out.recommendedPipelineStage === lead.pipeline_stage;

  const applyStage = async () => {
    if (stageMatches) return;
    try {
      await changeStage.mutateAsync({
        leadId: lead.id, newStage: out.recommendedPipelineStage as any, previousStage: lead.pipeline_stage,
      });
      toast.success(`Moved to ${stageLabel(out.recommendedPipelineStage)}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const saveDraftAsInteraction = async () => {
    if (!draftMsg.trim()) return;
    try {
      await createInteraction.mutateAsync({
        lead_id: lead.id,
        interaction_type: out.followUpDraft.channel === "phone" ? "phone_call" : (out.followUpDraft.channel as any),
        direction: "outbound",
        subject: out.followUpDraft.objective || "AI follow-up draft",
        content: draftMsg,
        interaction_date: new Date().toISOString(),
      });
      toast.success("Saved as interaction");
    } catch (e) { toast.error((e as Error).message); }
  };

  const createFollowUpTask = async (title: string, reason?: string) => {
    try {
      await createTask.mutateAsync({
        lead_id: lead.id,
        title,
        description: reason ?? null,
        priority: "high",
        status: "pending",
        due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      toast.success("Task created");
    } catch (e) { toast.error((e as Error).message); }
  };

  const matches = useMemo(() => rankProperties(properties, out.propertyMatchingCriteria), [properties, out.propertyMatchingCriteria]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Summary + scores */}
      <Card className="md:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[240px]">
            <h4 className="text-sm font-semibold">AI Summary</h4>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{out.summary}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Intent" value={`${out.intentScore}`} />
            <Metric label="Confidence" value={`${out.confidenceScore}`} />
            <div className="rounded-xl border border-border bg-canvas p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
              <p className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize", statusToneMap[out.buyerStatus] ?? "bg-muted")}>
                {out.buyerStatus.replace("_", " ")}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Pipeline recommendation */}
      <Card className="md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Recommended Pipeline Stage</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Current: <strong>{stageLabel(lead.pipeline_stage)}</strong> · Recommended:{" "}
              <strong>{stageLabel(out.recommendedPipelineStage)}</strong>
            </p>
          </div>
          <Button onClick={applyStage} disabled={stageMatches || changeStage.isPending} variant="outline">
            {stageMatches ? "Already on this stage" : "Apply recommendation"}
          </Button>
        </div>
      </Card>

      {/* Motivations */}
      <Card>
        <h4 className="text-sm font-semibold">Motivations</h4>
        {out.motivations.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">None detected.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {out.motivations.map((m, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{m.label}</p>
                  <span className="text-[10px] text-muted-foreground">Confidence {m.confidence}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>
                <EvidenceList refs={m.evidenceReferences} label={evidenceLabel} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Objections */}
      <Card>
        <h4 className="text-sm font-semibold">Objections</h4>
        {out.objections.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">None detected.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {out.objections.map((o, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{o.label}</p>
                  <span className="text-[10px] uppercase text-muted-foreground">{o.severity}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.explanation}</p>
                <p className="mt-2 text-xs"><span className="font-medium">Response: </span>{o.recommendedResponse}</p>
                <EvidenceList refs={o.evidenceReferences} label={evidenceLabel} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Urgency + Budget */}
      <Card>
        <h4 className="text-sm font-semibold">Urgency</h4>
        <p className="mt-2 text-xs"><span className="font-medium capitalize">{out.urgency.level}</span> — {out.urgency.explanation}</p>
        <EvidenceList refs={out.urgency.evidenceReferences} label={evidenceLabel} />
      </Card>
      <Card>
        <h4 className="text-sm font-semibold">Budget Signals</h4>
        <p className="mt-2 text-xs"><span className="font-medium capitalize">{out.budgetSignals.strength}</span> — {out.budgetSignals.explanation}</p>
        <EvidenceList refs={out.budgetSignals.evidenceReferences} label={evidenceLabel} />
      </Card>

      {/* Decision factors */}
      <Card>
        <h4 className="text-sm font-semibold">Decision Factors</h4>
        {out.decisionFactors.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">None identified.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {out.decisionFactors.map((d, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-2 text-xs">
                <span>{d.factor}</span>
                <span className="uppercase text-muted-foreground">{d.importance}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Risks */}
      <Card>
        <h4 className="text-sm font-semibold">Risks</h4>
        {out.risks.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No notable risks.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {out.risks.map((r, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{r.risk}</p>
                  <span className="text-[10px] uppercase text-muted-foreground">{r.severity}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.explanation}</p>
                <p className="mt-2 text-xs"><span className="font-medium">Action: </span>{r.recommendedAction}</p>
                <EvidenceList refs={r.evidenceReferences} label={evidenceLabel} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Next best actions */}
      <Card className="md:col-span-2">
        <h4 className="text-sm font-semibold">Next Best Actions</h4>
        {out.nextBestActions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No recommended actions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {out.nextBestActions
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">#{a.priority} · {a.action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.reason}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">When: {a.recommendedTiming}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => createFollowUpTask(a.action, a.reason)}>
                    <ListTodo className="h-3.5 w-3.5" /> Create task
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* Follow-up draft */}
      <Card className="md:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Suggested Follow-Up Draft</h4>
            <p className="text-xs text-muted-foreground">
              Channel: <strong className="capitalize">{out.followUpDraft.channel}</strong> · Objective: {out.followUpDraft.objective} · Tone: {out.followUpDraft.tone}
            </p>
          </div>
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-border bg-canvas p-3 text-sm"
          rows={5}
          value={draftMsg}
          onChange={(e) => setDraftMsg(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(draftMsg); toast.success("Copied"); }
            catch { toast.error("Copy failed"); }
          }}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={saveDraftAsInteraction} disabled={createInteraction.isPending}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> Save as interaction
          </Button>
          <Button variant="outline" size="sm" onClick={() => createFollowUpTask(`Send follow-up: ${out.followUpDraft.objective}`, draftMsg)}>
            <ListTodo className="h-3.5 w-3.5" /> Create follow-up task
          </Button>
        </div>
      </Card>

      {/* Property matches */}
      <Card className="md:col-span-2">
        <h4 className="text-sm font-semibold">Property Matches</h4>
        {matches.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No active properties match the criteria yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {matches.slice(0, 6).map((m) => (
              <li key={m.property.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{m.property.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.property.location ?? "—"} · {m.property.property_type ?? "—"} · {fmtMoney(m.property.price, m.property.currency)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{m.score}% match</span>
                </div>
                {m.reasons.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Matches: {m.reasons.join(", ")}</p>
                )}
                {m.conflicts.length > 0 && (
                  <p className="mt-1 text-xs text-destructive">Conflicts: {m.conflicts.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Missing information */}
      <Card>
        <h4 className="text-sm font-semibold">Missing Information</h4>
        {out.missingInformation.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nothing flagged.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {out.missingInformation.map((m, i) => (
              <li key={i} className="rounded-lg border border-border p-2 text-xs">
                <p className="font-medium">{m.field}</p>
                <p className="text-muted-foreground">{m.reason}</p>
                <p className="mt-1 italic">Ask: “{m.suggestedQuestion}”</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Evidence summary */}
      <Card>
        <h4 className="text-sm font-semibold">Evidence Summary</h4>
        {out.evidenceSummary.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No evidence references provided.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {out.evidenceSummary.map((e, i) => (
              <li key={i} className="rounded-lg border border-border p-2 text-xs">
                <p>{e.claim}</p>
                <EvidenceList refs={e.sourceReferences} label={evidenceLabel} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-canvas p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EvidenceList({ refs, label }: { refs: string[]; label: (r: string) => string }) {
  if (!refs?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {refs.map((r) => (
        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title={r}>
          {label(r)}
        </span>
      ))}
    </div>
  );
}

function resolveEvidenceLabel(ref: string, _ctx: { interactions: unknown[]; uploads: unknown[] }) {
  if (ref === "lead_profile") return "Lead profile";
  if (ref === "lead_notes") return "Lead notes";
  if (ref.startsWith("interaction:")) return "Interaction";
  if (ref.startsWith("upload:")) return "Uploaded document";
  if (ref.startsWith("property_interest:")) return "Property interest";
  if (ref.startsWith("previous_analysis:")) return "Previous analysis";
  return ref;
}

type Ranked = {
  property: any;
  score: number;
  reasons: string[];
  conflicts: string[];
};

function rankProperties(properties: any[], crit: BuyerAnalysisOutput["propertyMatchingCriteria"]): Ranked[] {
  if (!properties?.length) return [];
  const norm = (s: any) => String(s ?? "").toLowerCase();
  const ranked: Ranked[] = properties
    .filter((p) => p.status === "active" || !p.status)
    .map((p) => {
      const reasons: string[] = [];
      const conflicts: string[] = [];
      let max = 0;
      let got = 0;

      // Budget
      max += 25;
      const price = p.price ?? null;
      if (price != null && (crit.budgetMinimum != null || crit.budgetMaximum != null)) {
        const inMin = crit.budgetMinimum == null || price >= crit.budgetMinimum * 0.9;
        const inMax = crit.budgetMaximum == null || price <= crit.budgetMaximum * 1.1;
        if (inMin && inMax) { got += 25; reasons.push("budget"); }
        else conflicts.push("budget");
      }

      // Location
      max += 20;
      if (crit.locations?.length) {
        const loc = norm(p.location);
        if (crit.locations.some((l) => loc.includes(norm(l)))) { got += 20; reasons.push("location"); }
        else conflicts.push("location");
      }

      // Type
      max += 15;
      if (crit.propertyTypes?.length) {
        const t = norm(p.property_type);
        if (crit.propertyTypes.some((x) => norm(x) === t)) { got += 15; reasons.push("type"); }
        else conflicts.push("type");
      }

      // Bedrooms
      max += 10;
      if (crit.bedrooms?.length && p.bedrooms != null) {
        if (crit.bedrooms.includes(p.bedrooms)) { got += 10; reasons.push("bedrooms"); }
        else conflicts.push("bedrooms");
      }

      // Completion status
      max += 10;
      if (crit.completionStatus?.length && p.completion_status) {
        if (crit.completionStatus.map(norm).includes(norm(p.completion_status))) { got += 10; reasons.push("completion"); }
      }

      // Features
      const features: string[] = (p.features ?? p.amenities ?? []).map(norm);
      max += 20;
      if (crit.mustHaveFeatures?.length) {
        const missing = crit.mustHaveFeatures.filter((f) => !features.includes(norm(f)));
        if (missing.length === 0) { got += 12; reasons.push("must-have features"); }
        else conflicts.push(`missing ${missing.join(", ")}`);
      }
      if (crit.preferredFeatures?.length) {
        const have = crit.preferredFeatures.filter((f) => features.includes(norm(f))).length;
        got += Math.min(8, Math.round((have / crit.preferredFeatures.length) * 8));
        if (have) reasons.push("preferred features");
      }
      if (crit.avoidFeatures?.length) {
        const violated = crit.avoidFeatures.filter((f) => features.includes(norm(f)));
        if (violated.length) conflicts.push(`avoid: ${violated.join(", ")}`);
      }

      const score = max === 0 ? 0 : Math.round((got / max) * 100);
      return { property: p, score, reasons, conflicts };
    })
    .sort((a, b) => b.score - a.score);
  return ranked;
}
