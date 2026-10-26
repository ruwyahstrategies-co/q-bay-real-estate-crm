import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Phone,
  Mail,
  MessageCircle,
  Pencil,
  Sparkles,
  ChevronLeft,
  Plus,
  Trash2,
  UserPlus,
  SpellCheck,
  Undo2,
  ClipboardPlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PipelineStageBadge, IntentScore } from "@/components/status-badge";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { LeadOutcomeBadge, LeadOutcomeCard, LeadOutcomeMenu } from "@/components/lead-outcome";
import { InteractionDrawer } from "@/components/interaction-drawer";
import { TaskDrawer } from "@/components/task-drawer";
import { AssignmentHistory } from "@/components/assignment-history";
import { LeadHeaderActions, PendingHandoverBanner } from "@/components/lead-header-actions";
import { LeadActivityTimeline } from "@/components/lead-activity-timeline";
import { InteractionAttachments } from "@/components/interaction-attachments";
import { outcomeLabel } from "@/lib/activity";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { cn, titleCase } from "@/lib/utils";
import { useLead } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { useInteractions, useDeleteInteraction } from "@/hooks/use-interactions";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useUploads, useDeleteUpload, downloadUpload } from "@/hooks/use-uploads";
import { fmtDate, fmtDateTime, fmtMoney, TRANSACTION_TIMEFRAME_LABELS } from "@/lib/db";
import { effectiveIntentScore } from "@/lib/intent";
import { useAreas, usePlaces } from "@/hooks/use-locations";
import { BuyerIntelligencePanel } from "@/components/buyer-intelligence-panel";
import { CallTranscriptCard } from "@/components/call-transcript-card";
import { LeadSharedPropertiesSection } from "@/components/share-history";
import { useLeadAnalyses, useAnalyseLead } from "@/hooks/use-ai-analyses";
import { useLeadReferences } from "@/hooks/use-references";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import {
  useLeadNotes,
  useLeadNoteVersions,
  useCreateLeadNote,
  useUpdateLeadNote,
  useDeleteLeadNote,
} from "@/hooks/use-lead-notes";
import { useCorrectNoteSpelling } from "@/hooks/use-note-spelling";
import { usePropertyMatchesForLead } from "@/hooks/use-matching";
import { useLeadViewings } from "@/hooks/use-viewings";
import { ScheduleViewingDrawer, ViewingDetailDrawer, ViewingStatusBadge } from "@/components/viewing-drawers";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import { useLeadOffers, useCreateOffer, useUpdateOffer, OFFER_STATUSES } from "@/hooks/use-offers";
import { OfferFormsPanel } from "@/components/offer-forms-panel";
import { useSetNegotiationProperty } from "@/hooks/use-closing";
import { useLeadWhatsapp, useSendWhatsapp } from "@/hooks/use-whatsapp";
import { useConvertLeadToOwner } from "@/hooks/use-leads";
import { MaskedPhone } from "@/components/masked-phone";
import { DynamicFieldsView, type CustomFieldValues } from "@/components/dynamic-fields";
import { propertyCodePrefix } from "@/lib/property-number";

export const Route = createFileRoute("/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead Profile" }] }),
  component: LeadProfilePage,
});

const tabs = [
  "Overview",
  "Notes",
  "Conversations",
  "Viewings",
  "Property Interests",
  "Offers",
  "Buyer Intelligence",
  "Files",
  "Tasks",
  "Activity",
] as const;

function LeadProfilePage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [editOpen, setEditOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  // A task started from one conversation keeps that conversation as its source.
  const [interactionTask, setInteractionTask] = useState<{ id: string; subject: string | null } | null>(null);

  const { data: lead, isLoading } = useLead(leadId);
  const { data: team = [] } = useTeamMembers();
  const { data: areas = [] } = useAreas();
  const { data: places = [] } = usePlaces();
  const { data: interactions = [] } = useInteractions({ leadId });
  const { data: tasks = [] } = useTasks({ leadId });
  const { data: files = [] } = useUploads({ leadId });
  const { data: analyses = [] } = useLeadAnalyses(leadId);
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const analyseMut = useAnalyseLead();
  const convertToOwner = useConvertLeadToOwner();
  const deleteInteraction = useDeleteInteraction();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const deleteUpload = useDeleteUpload();
  const { can } = usePermissions();

  if (isLoading)
    return (
      <AppShell>
        <EmptyState title="Loading..." />
      </AppShell>
    );
  if (!lead)
    return (
      <AppShell>
        <EmptyState title="Lead not found" description="This lead may have been deleted." />
      </AppShell>
    );

  const agent = team.find((t) => t.id === lead.assigned_agent_id);
  const initials = lead.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const currentAnalysis = analyses.find((a) => a.status === "completed");
  const processingAnalysis = analyses.find((a) => a.status === "processing");
  const baseIntentScore = (currentAnalysis?.output_json as any)?.intentScore ?? null;
  const intentScore =
    lead && typeof baseIntentScore === "number"
      ? effectiveIntentScore(baseIntentScore, lead)
      : baseIntentScore;
  const preferredAreaName = lead?.preferred_area_id
    ? areas.find((a) => a.id === lead.preferred_area_id)?.name
    : null;
  const preferredPlaceName = lead?.preferred_place_id
    ? places.find((p) => p.id === lead.preferred_place_id)?.name
    : null;
  const isAnalysing = analyseMut.isPending || !!processingAnalysis;
  const handleAnalyse = async () => {
    try {
      const res = await analyseMut.mutateAsync(lead.id);
      if (res.status === "completed") {
        toast.success("Analysis complete");
        setTab("Buyer Intelligence");
      } else toast.error(res.error || "Analysis failed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const wonStage =
    stages.find((s) => s.stage_key === lead.pipeline_stage)?.is_won ??
    lead.pipeline_stage === "won";
  const canConvertToOwner = can("owners", "create");

  const handleConvertToOwner = async () => {
    try {
      const owner = await convertToOwner.mutateAsync(lead);
      toast.success(lead.converted_owner_id ? "Owner profile" : "Owner created");
      navigate({ to: "/owners/$ownerId", params: { ownerId: owner.id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
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
        <Link
          to="/leads"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All leads
        </Link>

        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pastel-purple text-base font-semibold text-foreground">
                {initials || "-"}
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{lead.full_name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PipelineStageBadge stage={stageLabelFrom(stages, lead.pipeline_stage)} />
                  <LeadOutcomeBadge lead={lead} />
                  <IntentScore score={intentScore} />
                  <span className="text-xs text-muted-foreground">
                    {agent?.full_name ?? "Unassigned agent"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`}>
                  <Button variant="outline" size="sm">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </Button>
                </a>
              )}
              {lead.phone && (
                <a
                  href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`}>
                  <Button variant="outline" size="sm">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </Button>
                </a>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              <LeadOutcomeMenu lead={lead} />
              <LeadHeaderActions lead={lead} />
              {canRunAi && (
                <Button size="sm" disabled={isAnalysing} onClick={handleAnalyse}>
                  <Sparkles className="h-3.5 w-3.5" />{" "}
                  {isAnalysing ? "Analysing..." : currentAnalysis ? "Reanalyse" : "Analyse Lead"}
                </Button>
              )}
              {wonStage &&
                canConvertToOwner &&
                (lead.converted_owner_id ? (
                  <Link to="/owners/$ownerId" params={{ ownerId: lead.converted_owner_id }}>
                    <Button variant="outline" size="sm">
                      <UserPlus className="h-3.5 w-3.5" /> View Owner Profile
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    disabled={convertToOwner.isPending}
                    onClick={handleConvertToOwner}
                  >
                    <UserPlus className="h-3.5 w-3.5" />{" "}
                    {convertToOwner.isPending ? "Converting..." : "Convert To Owner"}
                  </Button>
                ))}
            </div>
          </div>
        </Card>

        <PendingHandoverBanner lead={lead} />

        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t
                  ? "border-qbay text-qbay"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <LeadOutcomeCard lead={lead} />
            <Card>
              <h4 className="text-sm font-semibold">Contact</h4>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  <MaskedPhone value={lead.phone} />
                </dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{lead.email ?? "-"}</dd>
                <dt className="text-muted-foreground">Nationality</dt>
                <dd>{lead.nationality ?? "-"}</dd>
                <dt className="text-muted-foreground">Language</dt>
                <dd>{lead.preferred_language ?? "-"}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{lead.lead_source ?? "-"}</dd>
              </dl>
            </Card>
            <Card>
              <h4 className="text-sm font-semibold">Preferences</h4>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <dt className="text-muted-foreground">Budget</dt>
                <dd>
                  {fmtMoney(lead.budget_min, lead.currency)} -{" "}
                  {fmtMoney(lead.budget_max, lead.currency)}
                </dd>
                <dt className="text-muted-foreground">Preferred area</dt>
                <dd>
                  {preferredAreaName
                    ? [preferredAreaName, preferredPlaceName].filter(Boolean).join(" / ")
                    : (lead.preferred_locations?.join(", ") ?? "-")}
                </dd>
                <dt className="text-muted-foreground">Types</dt>
                <dd>{lead.preferred_property_types?.join(", ") ?? "-"}</dd>
                <dt className="text-muted-foreground">Purpose</dt>
                <dd>{lead.purchase_purpose ?? "-"}</dd>
                <dt className="text-muted-foreground">Timeline</dt>
                <dd>{lead.buying_timeline ?? "-"}</dd>
                <dt className="text-muted-foreground">Expected timeframe</dt>
                <dd>
                  {lead.transaction_timeframe
                    ? (TRANSACTION_TIMEFRAME_LABELS[lead.transaction_timeframe] ??
                      lead.transaction_timeframe)
                    : "-"}
                </dd>
                <dt className="text-muted-foreground">Intended date</dt>
                <dd>
                  {lead.intended_transaction_date ? fmtDate(lead.intended_transaction_date) : "-"}
                </dd>
                <dt className="text-muted-foreground">Financing</dt>
                <dd>{lead.financing_status ?? "-"}</dd>
              </dl>
            </Card>
            {lead.notes && (
              <Card className="md:col-span-2">
                <h4 className="text-sm font-semibold">Notes</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {lead.notes}
                </p>
              </Card>
            )}
            <DynamicFieldsView
              entityType="lead"
              values={lead.custom_fields as CustomFieldValues | null}
            />
            <div className="md:col-span-2">
              <LeadSharedPropertiesSection leadId={lead.id} />
            </div>
            <LeadPropertyMatches leadId={lead.id} />
            <AssignmentHistory entity="lead" id={lead.id} />
          </div>
        )}

        {tab === "Notes" && <NotesTab leadId={lead.id} />}

        {tab === "Conversations" && (
          <div className="space-y-3">
            {canCreateInteraction && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setInteractionOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add interaction
                </Button>
              </div>
            )}
            <CallTranscriptCard lead={lead} />
            {canCreateInteraction && <WhatsappSendBox leadId={lead.id} phone={lead.phone} />}
            {interactions.length === 0 ? (
              <EmptyState
                compact
                title="No interactions yet"
                description="Log a call, WhatsApp message, meeting or note."
              />
            ) : (
              <div className="space-y-2">
                {interactions.map((i) => (
                  <Card key={i.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            {i.interaction_type.replace(/_/g, " ")}
                          </span>
                          {i.direction && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {i.direction}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {fmtDateTime(i.interaction_date)}
                          </span>
                          {outcomeLabel(i.outcome) && (
                            <span className="rounded-full bg-qbay-tint px-2 py-0.5 text-[10px] text-qbay">
                              {outcomeLabel(i.outcome)}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            by{" "}
                            {team.find((m) => m.id === i.actor_team_member_id)?.full_name ??
                              team.find((m) => m.user_id === i.created_by)?.full_name ??
                              "unknown"}
                            {i.lead_stage ? ` · in ${stageLabelFrom(stages, i.lead_stage)}` : ""}
                          </span>
                          {(i as any).transcript && (
                            <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[10px]">
                              transcript
                            </span>
                          )}
                        </div>
                        {i.subject && <p className="mt-2 text-sm font-medium">{i.subject}</p>}
                        {i.content && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {i.content}
                          </p>
                        )}
                        <InteractionAttachments files={files.filter((f) => f.interaction_id === i.id)} />
                      </div>
                      {canCreateTask && (
                        <button
                          type="button"
                          className="rounded-md p-1.5 hover:bg-muted"
                          title="Add a task from this conversation"
                          aria-label="Add a task from this conversation"
                          onClick={() => setInteractionTask(i)}
                        >
                          <ClipboardPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeleteInteraction && (
                        <button
                          className="rounded-md p-1.5 hover:bg-muted text-destructive"
                          onClick={async () => {
                            try {
                              await deleteInteraction.mutateAsync(i.id);
                              toast.success("Deleted");
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
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

        {tab === "Viewings" && <ViewingsTab leadId={lead.id} />}
        {tab === "Offers" && <OffersTab leadId={lead.id} developmentId={lead.development_id} />}

        {tab === "Property Interests" && (
          <PropertyInterestsTab leadId={lead.id} onEdit={canEdit ? () => setEditOpen(true) : undefined} />
        )}

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
                      <p className="text-xs text-muted-foreground">
                        {f.category} · {f.processing_status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadUpload(f).catch((e) => toast.error((e as Error).message))
                        }
                      >
                        Download
                      </Button>
                      {canDeleteUpload && (
                        <button
                          className="rounded-md p-1.5 hover:bg-muted text-destructive"
                          onClick={async () => {
                            try {
                              await deleteUpload.mutateAsync(f);
                              toast.success("Deleted");
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
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
                <Button size="sm" onClick={() => setTaskOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add task
                </Button>
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
                              patch: {
                                status: e.target.checked ? "completed" : "pending",
                                completed_at: e.target.checked ? new Date().toISOString() : null,
                              },
                            });
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      />
                      <div>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            t.status === "completed" && "line-through text-muted-foreground",
                          )}
                        >
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Due {fmtDateTime(t.due_at)} · {t.priority}
                        </p>
                      </div>
                    </div>
                    <button
                      className="rounded-md p-1.5 hover:bg-muted text-destructive"
                      onClick={async () => {
                        try {
                          await deleteTask.mutateAsync(t.id);
                          toast.success("Deleted");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
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

        {tab === "Activity" && <LeadActivityTimeline lead={lead} />}

        <AddLeadDrawer open={editOpen} onOpenChange={setEditOpen} lead={lead} />
        <InteractionDrawer
          open={interactionOpen}
          onOpenChange={setInteractionOpen}
          defaultLeadId={lead.id}
        />
        <TaskDrawer open={taskOpen} onOpenChange={setTaskOpen} defaultLeadId={lead.id} />
        <TaskDrawer
          open={!!interactionTask}
          onOpenChange={(v) => !v && setInteractionTask(null)}
          defaultLeadId={lead.id}
          defaultTitle={interactionTask?.subject ? `Follow up: ${interactionTask.subject}` : `Follow up: ${lead.full_name}`}
          source="interaction"
          sourceRef={interactionTask?.id}
        />
        <ConfirmDialog open={false} title="" onConfirm={() => {}} onCancel={() => {}} />
      </PermissionGate>
    </AppShell>
  );
}

function LeadPropertyMatches({ leadId }: { leadId: string }) {
  const { data: matches = [] } = usePropertyMatchesForLead(leadId);
  if (matches.length === 0) return null;
  return (
    <Card className="md:col-span-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-3.5 w-3.5" /> Recommended properties
      </h4>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Deterministic match on purpose, location, type, budget and development.
      </p>
      <ul className="mt-3 space-y-2">
        {matches.map((m) => (
          <li
            key={m.property_id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
          >
            <Link
              to="/properties/$propertyId"
              params={{ propertyId: m.property_id }}
              className="hover:underline"
            >
              View property {m.reasons.length ? `- ${m.reasons.join(", ")}` : ""}
            </Link>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">score {m.score}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WhatsappSendBox({ leadId, phone }: { leadId: string; phone: string | null }) {
  const send = useSendWhatsapp();
  const { data: wa } = useLeadWhatsapp(leadId);
  const [message, setMessage] = useState("");
  // One id per message being typed: pressing Send twice, or retrying after a slow reply, sends it once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  if (!phone) return null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">WhatsApp</h4>
        <Link to="/whatsapp" search={{ lead: leadId }} className="text-xs underline-offset-2 hover:underline">
          Open in inbox{wa && wa.unread > 0 ? ` (${wa.unread} unread)` : ""}
        </Link>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Goes out on the WhatsApp number set up in Settings and is logged as a conversation on this lead.
        Free text works for 24 hours after they last wrote; otherwise use an approved template in the inbox.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          className="h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button
          size="sm"
          disabled={send.isPending || !message.trim()}
          onClick={async () => {
            try {
              await send.mutateAsync({ lead_id: leadId, message: message.trim(), client_request_id: requestId });
              setMessage("");
              setRequestId(crypto.randomUUID());
              toast.success("Message sent");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Send
        </Button>
      </div>
    </Card>
  );
}

function NotesTab({ leadId }: { leadId: string }) {
  const { data: notes = [] } = useLeadNotes(leadId);
  const { teamMember } = useCurrentUser();
  const create = useCreateLeadNote();
  const del = useDeleteLeadNote();
  const { can } = usePermissions();
  const correctSpelling = useCorrectNoteSpelling();
  const [draft, setDraft] = useState("");
  // The note exactly as typed, kept only after a correction so it can be restored.
  const [beforeCorrection, setBeforeCorrection] = useState<string | null>(null);
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");

  async function handleCorrectSpelling() {
    const original = draft;
    if (!original.trim() || correctSpelling.isPending) return;
    try {
      const corrected = await correctSpelling.mutateAsync(original);
      if (corrected.trim() === original.trim()) {
        toast.success("No spelling changes needed");
        return;
      }
      setBeforeCorrection(original);
      setDraft(corrected);
      toast.success("Spelling corrected. Review the note, then add it.");
    } catch (e) {
      toast.error(`${(e as Error).message}. Your note is unchanged and can still be added.`);
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <Card>
          <h4 className="text-sm font-semibold">Add note</h4>
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              className="min-h-20 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={correctSpelling.isPending}
              placeholder="Write a note about this lead..."
            />
            <div className="flex flex-wrap justify-end gap-2">
              {beforeCorrection !== null && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={correctSpelling.isPending || create.isPending}
                  onClick={() => {
                    setDraft(beforeCorrection);
                    setBeforeCorrection(null);
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Undo correction
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!draft.trim() || correctSpelling.isPending || create.isPending}
                onClick={handleCorrectSpelling}
              >
                <SpellCheck className="h-3.5 w-3.5" />
                {correctSpelling.isPending ? "Correcting..." : "Correct spelling"}
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim() || create.isPending || correctSpelling.isPending}
                onClick={async () => {
                  try {
                    await create.mutateAsync({
                      leadId,
                      content: draft.trim(),
                      authorId: teamMember?.id ?? null,
                    });
                    setDraft("");
                    setBeforeCorrection(null);
                    toast.success("Note added");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Add note
              </Button>
            </div>
          </div>
        </Card>
      )}
      {notes.length === 0 ? (
        <EmptyState
          compact
          title="No notes yet"
          description="Notes preserve every edit as version history."
        />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              leadId={leadId}
              canEdit={canEdit}
              canDelete={canDelete}
              onDelete={() => del.mutate({ id: n.id, leadId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  leadId,
  canEdit,
  canDelete,
  onDelete,
}: {
  note: {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
    team_members: { full_name: string } | null;
  };
  leadId: string;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [showHistory, setShowHistory] = useState(false);
  const update = useUpdateLeadNote();
  const { data: versions = [] } = useLeadNoteVersions(showHistory ? note.id : undefined);
  const wasEdited = note.updated_at !== note.created_at;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {note.team_members?.full_name ?? "Unknown"}
            </span>
            <span>{fmtDateTime(note.created_at)}</span>
            {wasEdited && <span>· edited {fmtDateTime(note.updated_at)}</span>}
          </div>
          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                className="min-h-20 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setContent(note.content);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={update.isPending || !content.trim()}
                  onClick={async () => {
                    try {
                      await update.mutateAsync({ id: note.id, content: content.trim(), leadId });
                      setEditing(false);
                      toast.success("Note updated - previous version kept in history");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm">{note.content}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canEdit && !editing && (
            <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {wasEdited && (
        <button
          className="mt-2 text-[11px] text-muted-foreground hover:underline"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Hide" : "Show"} edit history
        </button>
      )}
      {showHistory && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading history...</p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="rounded-md border border-border bg-canvas p-2 text-xs">
                <p className="text-muted-foreground">
                  {v.team_members?.full_name ?? "Unknown"} · {fmtDateTime(v.edited_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{v.content}</p>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function ViewingsTab({ leadId }: { leadId: string }) {
  const { data: viewings = [], isLoading } = useLeadViewings(leadId);
  const { data: team = [] } = useTeamMembers();
  const { can } = usePermissions();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const canCreate = can("viewings", "create");
  const agentName = (id: string | null) => team.find((m) => m.id === id)?.full_name ?? "Unassigned";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Viewings ({viewings.length})</h4>
        {canCreate && (
          <Button size="sm" onClick={() => setScheduleOpen(true)}>
            Schedule viewing
          </Button>
        )}
      </div>
      {isLoading ? (
        <EmptyState compact title="Loading..." />
      ) : viewings.length === 0 ? (
        <EmptyState compact title="No viewings scheduled" description="Scheduling a viewing also moves this lead to Viewing Scheduled." />
      ) : (
        <ul className="space-y-2">
          {viewings.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setDetailId(v.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-4 py-3 text-left shadow-card transition-colors hover:bg-qbay-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Open viewing on ${fmtQatarDateTime(v.scheduled_at)}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium tabular-nums">{fmtQatarDateTime(v.scheduled_at)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {v.properties
                      ? `${propertyCodePrefix(v.properties)}${v.properties.title}`
                      : "No property linked"}
                    {" · "}
                    {agentName(v.assigned_agent_id)}
                  </span>
                </span>
                <ViewingStatusBadge status={v.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ScheduleViewingDrawer open={scheduleOpen} onOpenChange={setScheduleOpen} defaultLeadId={leadId} />
      <ViewingDetailDrawer viewingId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}

function OffersTab({ leadId, developmentId }: { leadId: string; developmentId?: string | null }) {
  const { data: offers = [] } = useLeadOffers(leadId);
  const { data: refs } = useLeadReferences(leadId);
  const create = useCreateOffer();
  const update = useUpdateOffer();
  const { can } = usePermissions();
  const [propertyId, setPropertyId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const canCreate = can("offers", "create");
  const canEdit = can("offers", "edit");
  const interests = (refs?.interests ?? []) as any[];

  return (
    <div className="space-y-3">
      {canCreate && (
        <Card>
          <h4 className="text-sm font-semibold">Log an offer</h4>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Property
              <SearchableSelectField
                value={propertyId || null}
                onChange={(v) => setPropertyId(v ?? "")}
                options={interests.map((i) => ({
                  value: i.property_id,
                  label: i.properties?.title ?? i.property_id,
                }))}
                placeholder="Select property"
                searchPlaceholder="Search properties..."
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Amount (QAR)
              <input
                type="number"
                className="h-9 w-32 rounded-lg border border-border bg-canvas px-3 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-[11px] text-muted-foreground">
              Notes
              <input
                className="h-9 rounded-lg border border-border bg-canvas px-3 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={create.isPending}
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    lead_id: leadId,
                    property_id: propertyId || null,
                    development_id: propertyId ? null : (developmentId ?? null),
                    amount: amount ? Number(amount) : null,
                    notes: notes || null,
                    status: "submitted",
                  });
                  setPropertyId("");
                  setAmount("");
                  setNotes("");
                  toast.success("Offer logged");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Log offer
            </Button>
          </div>
        </Card>
      )}
      {offers.length === 0 ? (
        <EmptyState compact title="No offers logged" />
      ) : (
        <div className="space-y-2">
          {offers.map((o) => (
            <Card key={o.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setExpandedOfferId((cur) => (cur === o.id ? null : o.id))}
                >
                  <p className="text-sm font-medium">
                    {o.amount ? `${o.currency ?? "QAR"} ${o.amount.toLocaleString()}` : "Offer"}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {o.status.replace(/_/g, " ")} · {fmtDate(o.offer_date)}
                  </p>
                  {o.notes && <p className="text-xs text-muted-foreground mt-1">{o.notes}</p>}
                </button>
                {canEdit &&
                  !["accepted", "rejected", "withdrawn", "expired"].includes(o.status) && (
                    <SelectField
                      className="h-8 w-36 text-xs"
                      value={o.status}
                      onChange={(v) =>
                        update.mutate({ id: o.id, patch: { status: v ?? o.status } })
                      }
                      options={OFFER_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                      allowClear={false}
                    />
                  )}
              </div>
              <OfferFormsPanel offer={o} />
              {expandedOfferId === o.id && (
                <OfferAttachments offerId={o.id} canUpload={canCreate || canEdit} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferAttachments({ offerId, canUpload }: { offerId: string; canUpload: boolean }) {
  const { data: files = [] } = useUploads({ offerId });
  const del = useDeleteUpload();
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Attachments
      </p>
      {files.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">No files attached to this offer yet.</p>
      ) : (
        <ul className="mb-2 space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs"
            >
              <button
                type="button"
                className="truncate text-left hover:underline"
                onClick={() => downloadUpload(f)}
              >
                {f.filename}
              </button>
              <button
                type="button"
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  try {
                    await del.mutateAsync(f);
                    toast.success("Attachment removed");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <UploadDropzone
          title="Upload supporting document"
          description="PDF, Word, or image - up to 40MB"
          categoryKey="offer_attachments"
          offerId={offerId}
        />
      )}
    </div>
  );
}

const INTEREST_STATUS: Record<string, { label: string; cls: string }> = {
  reserved: { label: "In negotiation", cls: "bg-pastel-purple" },
  won: { label: "Won", cls: "bg-pastel-green" },
  lost: { label: "Lost", cls: "bg-muted text-muted-foreground" },
};

function PropertyInterestsTab({ leadId, onEdit }: { leadId: string; onEdit?: () => void }) {
  const { data, isLoading, isError, error, refetch } = useLeadReferences(leadId);
  const setNegotiated = useSetNegotiationProperty();
  const { can } = usePermissions();
  const canMark = can("leads", "edit");
  if (isLoading) return <EmptyState compact title="Loading..." />;
  if (isError) {
    return (
      <EmptyState
        compact
        title="Property interests could not be loaded"
        description={(error as Error)?.message ?? "Try again."}
        action={
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  const interests = (data?.interests ?? []) as any[];
  const mentioned = (data?.mentioned ?? []) as any[];
  const seen = new Set(interests.map((i) => i.property_id));
  const extras = mentioned.filter((m) => m.property_id && !seen.has(m.property_id));
  if (interests.length === 0 && extras.length === 0) {
    return (
      <EmptyState
        compact
        title="No property interests yet"
        description="Properties this lead views, mentions or shortlists will appear here."
        action={
          onEdit ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              Add property interests
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {interests.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Linked properties ({interests.length})</h4>
            {onEdit && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                Edit interests
              </Button>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {interests.map((it) => {
              const p = it.properties;
              if (!p) {
                // The link exists but the property record cannot be shown. Say so rather than hiding it.
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
                  >
                    <span>A linked property is no longer available</span>
                  </li>
                );
              }
              return (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
                >
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="hover:underline"
                  >
                    {propertyCodePrefix(p)}
                    {p.title}
                  </Link>
                  <span className="flex items-center gap-2">
                    {INTEREST_STATUS[it.status as string] ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", INTEREST_STATUS[it.status as string].cls)}>
                        {INTEREST_STATUS[it.status as string].label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground capitalize">{it.interest_level ?? "interested"}</span>
                    )}
                    {canMark && it.status !== "reserved" && it.status !== "won" && it.status !== "lost" && (
                      <button
                        type="button"
                        disabled={setNegotiated.isPending}
                        className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                        title="Mark this as the property being negotiated. Other shortlisted properties are not affected."
                        onClick={async () => {
                          try {
                            await setNegotiated.mutateAsync({ leadId, propertyId: p.id, holdProperty: false });
                            toast.success("Marked as the property being negotiated.");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        Being negotiated
                      </button>
                    )}
                  </span>
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
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
                >
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="hover:underline"
                  >
                    {propertyCodePrefix(p)}
                    {p.title}
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
