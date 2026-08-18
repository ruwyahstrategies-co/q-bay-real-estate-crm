import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Mail, MessageCircle, Pencil, Sparkles, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PipelineStageBadge, IntentScore } from "@/components/status-badge";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { InteractionDrawer } from "@/components/interaction-drawer";
import { TaskDrawer } from "@/components/task-drawer";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { useLead } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { useInteractions, useDeleteInteraction } from "@/hooks/use-interactions";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useUploads, useDeleteUpload, downloadUpload } from "@/hooks/use-uploads";
import { usePipelineHistory } from "@/hooks/use-pipeline-history";
import { fmtDate, fmtDateTime, fmtMoney, stageLabel } from "@/lib/db";
import { BuyerIntelligencePanel } from "@/components/buyer-intelligence-panel";
import { CallTranscriptCard } from "@/components/call-transcript-card";
import { useLeadAnalyses, useAnalyseLead } from "@/hooks/use-ai-analyses";
import { useLeadReferences } from "@/hooks/use-references";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";

export const Route = createFileRoute("/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead Profile" }] }),
  component: LeadProfilePage,
});

const tabs = ["Overview", "Conversations", "Property Interests", "Buyer Intelligence", "Files", "Tasks", "Activity"] as const;


function LeadProfilePage() {
  const { leadId } = Route.useParams();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [editOpen, setEditOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const { data: lead, isLoading } = useLead(leadId);
  const { data: team = [] } = useTeamMembers();
  const { data: interactions = [] } = useInteractions({ leadId });
  const { data: tasks = [] } = useTasks({ leadId });
  const { data: files = [] } = useUploads({ leadId });
  const { data: history = [] } = usePipelineHistory(leadId);
  const { data: analyses = [] } = useLeadAnalyses(leadId);
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const analyseMut = useAnalyseLead();
  const deleteInteraction = useDeleteInteraction();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const deleteUpload = useDeleteUpload();
  const { can } = usePermissions();

  if (isLoading) return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (!lead) return (
    <AppShell>
      <EmptyState title="Lead not found" description="This lead may have been deleted." />
    </AppShell>
  );

  const agent = team.find((t) => t.id === lead.assigned_agent_id);
  const initials = lead.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const currentAnalysis = analyses.find((a) => a.status === "completed");
  const processingAnalysis = analyses.find((a) => a.status === "processing");
  const intentScore = (currentAnalysis?.output_json as any)?.intentScore ?? null;
  const isAnalysing = analyseMut.isPending || !!processingAnalysis;
  const handleAnalyse = async () => {
    try {
      const res = await analyseMut.mutateAsync(lead.id);
      if (res.status === "completed") { toast.success("Analysis complete"); setTab("Buyer Intelligence"); }
      else toast.error(res.error || "Analysis failed");
    } catch (e) { toast.error((e as Error).message); }
  };

  const canEdit = can("leads", "edit");
  const canRunAi = can("ai_insights", "run");
  const canCreateInteraction = can("conversations", "create");
  const canCreateTask = can("tasks", "create");
  const canUpload = can("uploads", "upload");
  const canDeleteInteraction = can("conversations", "delete");
  const canDeleteUpload = can("uploads", "delete");

  return (
    <AppShell>
      <PermissionGate module="leads" action="view" page>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> All leads
      </Link>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pastel-purple text-base font-semibold text-foreground">
              {initials || "—"}
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{lead.full_name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PipelineStageBadge stage={stageLabelFrom(stages, lead.pipeline_stage)} />
                <IntentScore score={intentScore} />
                <span className="text-xs text-muted-foreground">{agent?.full_name ?? "Unassigned agent"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lead.phone && (
              <a href={`tel:${lead.phone}`}><Button variant="outline" size="sm"><Phone className="h-3.5 w-3.5" /> Call</Button></a>
            )}
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}><Button variant="outline" size="sm"><Mail className="h-3.5 w-3.5" /> Email</Button></a>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canRunAi && (
              <Button size="sm" disabled={isAnalysing} onClick={handleAnalyse}>
                <Sparkles className="h-3.5 w-3.5" /> {isAnalysing ? "Analysing…" : currentAnalysis ? "Reanalyse" : "Analyse Lead"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <h4 className="text-sm font-semibold">Contact</h4>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Phone</dt><dd>{lead.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Email</dt><dd>{lead.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Nationality</dt><dd>{lead.nationality ?? "—"}</dd>
              <dt className="text-muted-foreground">Language</dt><dd>{lead.preferred_language ?? "—"}</dd>
              <dt className="text-muted-foreground">Source</dt><dd>{lead.lead_source ?? "—"}</dd>
            </dl>
          </Card>
          <Card>
            <h4 className="text-sm font-semibold">Preferences</h4>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Budget</dt>
              <dd>{fmtMoney(lead.budget_min, lead.currency)} – {fmtMoney(lead.budget_max, lead.currency)}</dd>
              <dt className="text-muted-foreground">Locations</dt><dd>{lead.preferred_locations?.join(", ") ?? "—"}</dd>
              <dt className="text-muted-foreground">Types</dt><dd>{lead.preferred_property_types?.join(", ") ?? "—"}</dd>
              <dt className="text-muted-foreground">Purpose</dt><dd>{lead.purchase_purpose ?? "—"}</dd>
              <dt className="text-muted-foreground">Timeline</dt><dd>{lead.buying_timeline ?? "—"}</dd>
              <dt className="text-muted-foreground">Financing</dt><dd>{lead.financing_status ?? "—"}</dd>
            </dl>
          </Card>
          {lead.notes && (
            <Card className="md:col-span-2">
              <h4 className="text-sm font-semibold">Notes</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>
            </Card>
          )}
        </div>
      )}

      {tab === "Conversations" && (
        <div className="space-y-3">
          {canCreateInteraction && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setInteractionOpen(true)}><Plus className="h-3.5 w-3.5" /> Add interaction</Button>
            </div>
          )}
          <CallTranscriptCard lead={lead} />
          {interactions.length === 0 ? (
            <EmptyState compact title="No interactions yet" description="Log a call, WhatsApp message, meeting or note." />
          ) : (
            <div className="space-y-2">
              {interactions.map((i) => (
                <Card key={i.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">{i.interaction_type.replace(/_/g, " ")}</span>
                        {i.direction && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{i.direction}</span>}
                        <span className="text-xs text-muted-foreground">{fmtDateTime(i.interaction_date)}</span>
                        {(i as any).transcript && <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[10px]">transcript</span>}
                      </div>
                      {i.subject && <p className="mt-2 text-sm font-medium">{i.subject}</p>}
                      {i.content && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.content}</p>}
                    </div>
                    {canDeleteInteraction && (
                      <button
                        className="rounded-md p-1.5 hover:bg-muted text-destructive"
                        onClick={async () => {
                          try { await deleteInteraction.mutateAsync(i.id); toast.success("Deleted"); }
                          catch (e) { toast.error((e as Error).message); }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Property Interests" && <PropertyInterestsTab leadId={lead.id} />}

      {tab === "Buyer Intelligence" && <BuyerIntelligencePanel lead={lead} />}

      {tab === "Files" && (
        <div className="space-y-3">
          {canUpload && (
            <UploadDropzone
              title="Upload file for this lead"
              description="Documents, sheets or audio."
              categoryKey="general_documents"
              leadId={lead.id}
            />
          )}
          {files.length === 0 ? (
            <EmptyState compact title="No files yet" />
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <Card key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{f.filename}</p>
                    <p className="text-xs text-muted-foreground">{f.category} · {f.processing_status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadUpload(f).catch((e) => toast.error((e as Error).message))}>Download</Button>
                    {canDeleteUpload && (
                      <button
                        className="rounded-md p-1.5 hover:bg-muted text-destructive"
                        onClick={async () => {
                          try { await deleteUpload.mutateAsync(f); toast.success("Deleted"); }
                          catch (e) { toast.error((e as Error).message); }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Tasks" && (
        <div>
          {canCreateTask && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={() => setTaskOpen(true)}><Plus className="h-3.5 w-3.5" /> Add task</Button>
            </div>
          )}
          {tasks.length === 0 ? (
            <EmptyState compact title="No tasks yet" />
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <Card key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={t.status === "completed"}
                      onChange={async (e) => {
                        try {
                          await updateTask.mutateAsync({
                            id: t.id,
                            patch: { status: e.target.checked ? "completed" : "pending", completed_at: e.target.checked ? new Date().toISOString() : null },
                          });
                        } catch (err) { toast.error((err as Error).message); }
                      }}
                    />
                    <div>
                      <p className={cn("text-sm font-medium", t.status === "completed" && "line-through text-muted-foreground")}>{t.title}</p>
                      <p className="text-xs text-muted-foreground">Due {fmtDateTime(t.due_at)} · {t.priority}</p>
                    </div>
                  </div>
                  <button
                    className="rounded-md p-1.5 hover:bg-muted text-destructive"
                    onClick={async () => {
                      try { await deleteTask.mutateAsync(t.id); toast.success("Deleted"); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Activity" && (
        <ActivityTimeline
          leadId={lead.id}
          interactions={interactions}
          tasks={tasks}
          files={files}
          history={history}
          leadCreatedAt={lead.created_at}
        />
      )}

      <AddLeadDrawer open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <InteractionDrawer open={interactionOpen} onOpenChange={setInteractionOpen} defaultLeadId={lead.id} />
      <TaskDrawer open={taskOpen} onOpenChange={setTaskOpen} defaultLeadId={lead.id} />
      <ConfirmDialog open={false} title="" onConfirm={() => {}} onCancel={() => {}} />
      </PermissionGate>
    </AppShell>
  );
}

type ActivityEvent = { ts: string; label: string; sub?: string };

function ActivityTimeline({
  interactions,
  tasks,
  files,
  history,
  leadCreatedAt,
}: {
  leadId: string;
  interactions: { id: string; interaction_type: string; interaction_date: string; subject: string | null }[];
  tasks: { id: string; title: string; created_at: string; completed_at: string | null }[];
  files: { id: string; filename: string; created_at: string }[];
  history: { id: string; new_stage: string; previous_stage: string | null; changed_at: string }[];
  leadCreatedAt: string;
}) {
  const events: ActivityEvent[] = [
    { ts: leadCreatedAt, label: "Lead created" },
    ...history.map((h) => ({
      ts: h.changed_at,
      label: `Stage → ${stageLabel(h.new_stage)}`,
      sub: h.previous_stage ? `from ${stageLabel(h.previous_stage)}` : undefined,
    })),
    ...interactions.map((i) => ({
      ts: i.interaction_date,
      label: `Interaction · ${i.interaction_type.replace(/_/g, " ")}`,
      sub: i.subject ?? undefined,
    })),
    ...tasks.map((t) => ({ ts: t.created_at, label: `Task created · ${t.title}` })),
    ...tasks.filter((t) => t.completed_at).map((t) => ({ ts: t.completed_at!, label: `Task completed · ${t.title}` })),
    ...files.map((f) => ({ ts: f.created_at, label: `File uploaded · ${f.filename}` })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (events.length === 0) return <EmptyState compact title="No activity yet" />;

  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-canvas p-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">{e.label}</p>
            {e.sub && <p className="text-xs text-muted-foreground">{e.sub}</p>}
          </div>
          <span className="text-xs text-muted-foreground">{fmtDate(e.ts)}</span>
        </div>
      ))}
    </div>
  );
}

function PropertyInterestsTab({ leadId }: { leadId: string }) {
  const { data, isLoading } = useLeadReferences(leadId);
  if (isLoading) return <EmptyState compact title="Loading…" />;
  const interests = (data?.interests ?? []) as any[];
  const mentioned = (data?.mentioned ?? []) as any[];
  const seen = new Set(interests.map((i) => i.property_id));
  const extras = mentioned.filter((m) => m.property_id && !seen.has(m.property_id));
  if (interests.length === 0 && extras.length === 0) {
    return <EmptyState compact title="No property interests yet" description="Properties this lead views, mentions or shortlists will appear here." />;
  }
  return (
    <div className="space-y-3">
      {interests.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold">Linked properties</h4>
          <ul className="mt-3 space-y-2">
            {interests.map((it) => {
              const p = it.properties;
              if (!p) return null;
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                    {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                  </Link>
                  <span className="text-muted-foreground capitalize">{it.interest_level ?? it.status ?? "interested"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {extras.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold">Mentioned in conversations</h4>
          <ul className="mt-3 space-y-2">
            {extras.slice(0, 20).map((e, i) => {
              const p = e.properties;
              if (!p) return null;
              return (
                <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                    {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                  </Link>
                  <span className="text-muted-foreground">{fmtDate(e.occurred_at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}