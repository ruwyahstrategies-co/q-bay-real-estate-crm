import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Mail, ChevronLeft, Plus, Trash2, Building2, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { InteractionDrawer } from "@/components/interaction-drawer";
import { TaskDrawer } from "@/components/task-drawer";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ContractDrawer } from "@/components/contract-drawer";
import { downloadUpload, useUploads, useDeleteUpload } from "@/hooks/use-uploads";
import { useOwner, useOwnerProperties, useOwnerDevelopments, useOwnerTransactions } from "@/hooks/use-owners";
import { useInteractions, useDeleteInteraction } from "@/hooks/use-interactions";
import { useTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useOwnerContracts } from "@/hooks/use-owner-contracts";
import { openContractPdf, contractTitle } from "@/lib/contract-pdf";
import { useTeamMembers } from "@/hooks/use-team";
import { usePermissions } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/db";
import type { OwnerContract } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/owners/$ownerId")({
  head: () => ({ meta: [{ title: "Owner Profile" }] }),
  component: OwnerProfilePage,
});

function OwnerProfilePage() {
  const { ownerId } = Route.useParams();
  const { data: owner, isLoading } = useOwner(ownerId);
  const { data: team = [] } = useTeamMembers();
  const { data: properties = [] } = useOwnerProperties(ownerId);
  const { data: developments = [] } = useOwnerDevelopments(ownerId);
  const { data: interactions = [] } = useInteractions({ ownerId });
  const { data: tasks = [] } = useTasks({ ownerId });
  const { data: files = [] } = useUploads({ ownerId });
  const { data: transactions = [] } = useOwnerTransactions(ownerId);
  const { data: contracts = [] } = useOwnerContracts(ownerId);
  const deleteInteraction = useDeleteInteraction();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const deleteUpload = useDeleteUpload();
  const { can } = usePermissions();

  const [interactionOpen, setInteractionOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [editContract, setEditContract] = useState<OwnerContract | null>(null);

  if (isLoading) return <AppShell><EmptyState title="Loading..." /></AppShell>;
  if (!owner) return <AppShell><EmptyState title="Owner not found" description="This owner may have been deleted." /></AppShell>;

  const canEdit = can("owners", "edit");
  const canCreateInteraction = can("conversations", "create");
  const canDeleteInteraction = can("conversations", "delete");
  const canCreateTask = can("tasks", "create");
  const canUpload = can("uploads", "upload");
  const canDeleteUpload = can("uploads", "delete");
  const canCreateContract = can("contracts", "create") || can("contracts", "generate");
  const canEditContract = can("contracts", "edit") || can("contracts", "generate");

  const agent = team.find((t) => t.id === owner.assigned_agent_id);
  const lastContacted = interactions[0]?.interaction_date ?? null;
  const now = Date.now();
  const upcomingFollowUp = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled" && t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
    .find((t) => new Date(t.due_at!).getTime() >= now) ?? tasks.find((t) => t.status !== "completed" && t.status !== "cancelled");

  const activeListings = properties.filter((p) => p.status === "active");
  const closedListings = properties.filter((p) => p.status !== "active");

  const initials = owner.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <AppShell>
      <PermissionGate module="owners" action="view" page>
        <Link to="/owners" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> All owners
        </Link>

        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pastel-purple text-base font-semibold text-foreground">
                {initials || "-"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">{owner.name}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide">{owner.code ?? "--"}</span>
                  {owner.is_developer && <span className="flex items-center gap-1 rounded-full bg-pastel-green px-2 py-0.5 text-[10px]"><Building2 className="h-3 w-3" /> Developer</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {owner.company && <span>{owner.company}</span>}
                  <span>{agent ? `Agent: ${agent.full_name}` : "Unassigned agent"}</span>
                  <span>Last contacted: {lastContacted ? fmtDateTime(lastContacted) : "Never"}</span>
                  {upcomingFollowUp && <span>Next follow-up: {fmtDateTime(upcomingFollowUp.due_at)}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {owner.phone && <a href={`tel:${owner.phone}`}><Button variant="outline" size="sm"><Phone className="h-3.5 w-3.5" /> Call</Button></a>}
              {owner.email && <a href={`mailto:${owner.email}`}><Button variant="outline" size="sm"><Mail className="h-3.5 w-3.5" /> Email</Button></a>}
              {canCreateInteraction && <Button variant="outline" size="sm" onClick={() => setInteractionOpen(true)}><Plus className="h-3.5 w-3.5" /> Log Contact</Button>}
              {canCreateTask && <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Follow-Up</Button>}
              <Link to="/properties"><Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5" /> Add Property</Button></Link>
              {canCreateContract && (
                <Button size="sm" onClick={() => { setEditContract(null); setContractOpen(true); }}>
                  <FileDown className="h-3.5 w-3.5" /> Generate Contract
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <h4 className="text-sm font-semibold">Contact</h4>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Phone</dt><dd>{owner.phone ?? "-"}</dd>
              <dt className="text-muted-foreground">Email</dt><dd>{owner.email ?? "-"}</dd>
              <dt className="text-muted-foreground">Address</dt><dd>{owner.address ?? "-"}</dd>
              <dt className="text-muted-foreground">Type</dt><dd>{owner.is_developer ? "Developer" : "Individual"}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{fmtDate(owner.created_at)}</dd>
              <dt className="text-muted-foreground">Last updated</dt><dd>{fmtDate(owner.updated_at)}</dd>
            </dl>
            {canEdit && <p className="mt-3 text-[11px] text-muted-foreground">Edit contact details from the Owners list.</p>}
          </Card>

          <Card>
            <h4 className="text-sm font-semibold">Notes</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{owner.notes || "No notes yet."}</p>
          </Card>

          <Card>
            <h4 className="text-sm font-semibold">Active listings ({activeListings.length})</h4>
            {activeListings.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No active listings.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activeListings.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                    <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                      {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                    </Link>
                    <span className="text-muted-foreground">{fmtMoney(p.price, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h4 className="text-sm font-semibold">Sold / rented / other listings ({closedListings.length})</h4>
            {closedListings.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {closedListings.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                    <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                      {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                    </Link>
                    <span className="capitalize text-muted-foreground">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {developments.length > 0 && (
            <Card className="md:col-span-2">
              <h4 className="text-sm font-semibold">Linked developments</h4>
              <ul className="mt-3 space-y-2">
                {developments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                    <Link to="/developments/$developmentId" params={{ developmentId: d.id }} className="hover:underline">{d.name}</Link>
                    <span className="capitalize text-muted-foreground">{d.status ?? "-"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="md:col-span-2">
            <h4 className="text-sm font-semibold">Linked transactions</h4>
            {transactions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No transactions recorded against this owner's properties yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {transactions.map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                    <span>{t.properties?.reference_code ? `${t.properties.reference_code} · ` : ""}{t.properties?.title ?? "Property"} - {t.transaction_type}</span>
                    <span className="text-muted-foreground">{fmtMoney(t.transaction_value, t.currency)} · {t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Contracts</h4>
              {canCreateContract && (
                <Button size="sm" variant="outline" onClick={() => { setEditContract(null); setContractOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> New contract
                </Button>
              )}
            </div>
            {contracts.length === 0 ? (
              <EmptyState compact title="No contracts yet" description="Generate one from a linked property." />
            ) : (
              <div className="mt-3 space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas p-3">
                    <div>
                      <p className="text-sm font-medium capitalize">{c.purpose} contract {c.properties ? `· ${c.properties.reference_code ?? c.properties.title}` : ""}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status} · {fmtMoney(c.amount, c.currency)} {c.expiry_date ? `· expires ${fmtDate(c.expiry_date)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.generated_html && (
                        <Button variant="outline" size="sm" onClick={() => openContractPdf(c.generated_html!, contractTitle(null, owner))}>View PDF</Button>
                      )}
                      {canEditContract && (
                        <Button variant="outline" size="sm" onClick={() => { setEditContract(c); setContractOpen(true); }}>Edit</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Documents</h4>
            </div>
            {canUpload && (
              <div className="mt-3">
                <UploadDropzone title="Upload owner document" description="Contracts, ID, POA, etc." categoryKey="owner_documents" ownerId={owner.id} />
              </div>
            )}
            {files.length === 0 ? (
              <EmptyState compact title="No documents yet" />
            ) : (
              <div className="mt-3 space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{f.filename}</span>
                      <span className="text-muted-foreground">{f.processing_status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadUpload(f).catch((e) => toast.error((e as Error).message))}>Download</Button>
                      {canDeleteUpload && (
                        <button
                          className="rounded-md p-1.5 hover:bg-muted text-destructive"
                          onClick={async () => { try { await deleteUpload.mutateAsync(f); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); } }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Communication & activity history</h4>
            </div>
            {interactions.length === 0 ? (
              <EmptyState compact title="No contact logged yet" description="Use Log Contact to record calls, meetings or notes." />
            ) : (
              <div className="mt-3 space-y-2">
                {interactions.map((i) => (
                  <div key={i.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-canvas p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">{i.interaction_type.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(i.interaction_date)}</span>
                      </div>
                      {i.subject && <p className="mt-2 text-sm font-medium">{i.subject}</p>}
                      {i.content && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.content}</p>}
                    </div>
                    {canDeleteInteraction && (
                      <button
                        className="rounded-md p-1.5 hover:bg-muted text-destructive"
                        onClick={async () => { try { await deleteInteraction.mutateAsync(i.id); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); } }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="md:col-span-2">
            <h4 className="text-sm font-semibold">Follow-ups</h4>
            {tasks.length === 0 ? (
              <EmptyState compact title="No follow-ups scheduled" />
            ) : (
              <div className="mt-3 space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas p-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={t.status === "completed"}
                        onChange={async (e) => {
                          try {
                            await updateTask.mutateAsync({ id: t.id, patch: { status: e.target.checked ? "completed" : "pending", completed_at: e.target.checked ? new Date().toISOString() : null } });
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
                      onClick={async () => { try { await deleteTask.mutateAsync(t.id); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); } }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <InteractionDrawer open={interactionOpen} onOpenChange={setInteractionOpen} defaultOwnerId={owner.id} />
        <TaskDrawer open={taskOpen} onOpenChange={setTaskOpen} defaultOwnerId={owner.id} />
        <ContractDrawer open={contractOpen} onOpenChange={setContractOpen} owner={owner} contract={editContract} />
      </PermissionGate>
    </AppShell>
  );
}
