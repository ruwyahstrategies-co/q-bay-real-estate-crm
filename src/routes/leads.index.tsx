import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Upload, Download, LayoutGrid, Rows3, Users, Pencil, Archive, Trash2, MessageCircle } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { DialogShell } from "@/components/overlay";
import { useSendWhatsapp } from "@/hooks/use-whatsapp";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterPill } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { LeadImporter } from "@/components/lead-importer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PipelineStageBadge, IntentScore } from "@/components/status-badge";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { cn } from "@/lib/utils";
import { useArchiveLead, useDeleteLead, useLeads, useUpdateLead } from "@/hooks/use-leads";
import { useAllCompletedAnalyses } from "@/hooks/use-ai-analyses";
import { useTeamMembers } from "@/hooks/use-team";
import { useDevelopments } from "@/hooks/use-developments";
import { fmtMoney, fmtDate, LEAD_CLASSIFICATIONS, LEAD_WORKFLOWS, type Lead } from "@/lib/db";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Leads" },
      { name: "description", content: "Manage buyer leads, intent and pipeline stages." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const [open, setOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [view, setView] = useState<"table" | "cards">("table");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [classification, setClassification] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const { data: leads = [], isLoading } = useLeads({ search, stage, agent, classification, workflow, developmentId });
  const { data: team = [] } = useTeamMembers();
  const { data: developments = [] } = useDevelopments();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const { data: completedAnalyses = [] } = useAllCompletedAnalyses();
  const archive = useArchiveLead();
  const del = useDeleteLead();
  const updateLead = useUpdateLead();
  const agentName = (id: string | null) => team.find((t) => t.id === id)?.full_name ?? "Unassigned";
  const { can } = usePermissions();
  const canCreate = can("leads", "create");
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");
  const canAssign = can("leads", "assign");

  // Latest completed analysis per lead, powering the Intent Score column.
  const intentByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of completedAnalyses) {
      if (!a.lead_id || map.has(a.lead_id)) continue;
      const out = a.output_json as any;
      const score = out?.deep_analysis?.intent_score ?? out?.intentScore;
      if (typeof score === "number") map.set(a.lead_id, score);
    }
    return map;
  }, [completedAnalyses]);

  async function assignAgent(leadId: string, agentId: string | null) {
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { assigned_agent_id: agentId } });
      toast.success(agentId ? "Agent assigned" : "Lead unassigned");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell>
      <PermissionGate module="leads" action="view" page>
      <PageHeader
        eyebrow="Buyers"
        title="All Leads"
        description="Centralised buyer database with intent, budget and stage."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `leads-${new Date().toISOString().slice(0, 10)}.csv`,
                  leads,
                  [
                    { key: "full_name", label: "Full name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "classification", label: "Classification" },
                    { key: "workflow", label: "Workflow" },
                    { key: "budget_min", label: "Budget min" },
                    { key: "budget_max", label: "Budget max" },
                    { key: "currency", label: "Currency" },
                    { key: "preferred_locations", label: "Preferred locations" },
                    { key: "preferred_property_types", label: "Preferred property types" },
                    { key: "pipeline_stage", label: "Pipeline stage" },
                    { key: "lead_source", label: "Source" },
                    { key: "assigned_agent_id", label: "Assigned agent id" },
                    { key: "created_at", label: "Created" },
                  ],
                )
              }
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            {canCreate && (
              <Button variant="outline" size="sm" onClick={() => setImporterOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Import Leads
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => { setEditLead(null); setOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <SelectField
          value={stage}
          onChange={(v) => setStage(v)}
          options={stages.map((s) => ({ value: s.stage_key, label: s.name }))}
          emptyLabel="All stages"
          className="w-auto min-w-[130px] text-xs"
        />
        <SearchableSelectField
          value={agent}
          onChange={(v) => setAgent(v)}
          options={team.map((m) => ({ value: m.id, label: m.full_name }))}
          emptyLabel="All agents"
          searchPlaceholder="Search agents..."
          className="w-auto min-w-[130px] text-xs"
        />
        <SelectField
          value={classification}
          onChange={(v) => setClassification(v)}
          options={LEAD_CLASSIFICATIONS.map((c) => ({ value: c, label: c }))}
          emptyLabel="All types"
          className="w-auto min-w-[110px] text-xs"
        />
        <SelectField
          value={workflow}
          onChange={(v) => setWorkflow(v)}
          options={LEAD_WORKFLOWS.map((w) => ({ value: w, label: w }))}
          emptyLabel="Sales + Telesales"
          className="w-auto min-w-[140px] text-xs"
        />
        <SearchableSelectField
          value={developmentId}
          onChange={(v) => setDevelopmentId(v)}
          options={developments.map((d) => ({ value: d.id, label: d.name }))}
          emptyLabel="All developments"
          searchPlaceholder="Search developments..."
          className="w-auto min-w-[150px] text-xs"
        />
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "table" && "bg-canvas")} onClick={() => setView("table")} aria-label="Table view">
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "cards" && "bg-canvas")} onClick={() => setView("cards")} aria-label="Card view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-xs">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setBroadcastOpen(true)}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp Broadcast</Button>
          <button className="ml-auto text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === "table" ? (
        <DataTable
          columns={["", "Buyer", "Contact", "Budget", "Preferred Area", "Property Type", "Intent Score", "Pipeline Stage", "Assigned Agent", "Last Contact", "Actions"]}
          empty={
            isLoading ? (
              <EmptyState title="Loading leads..." />
            ) : (
              <EmptyState
                icon={<Users className="h-4 w-4" />}
                title="No leads yet"
                description="Add a lead manually or import a CSV/XLSX file to get started."
                action={
                  canCreate ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setImporterOpen(true)}>
                        <Upload className="h-3.5 w-3.5" /> Import Leads
                      </Button>
                      <Button size="sm" onClick={() => { setEditLead(null); setOpen(true); }}>
                        <Plus className="h-3.5 w-3.5" /> Add Lead
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            )
          }
        >
          {leads.length > 0
            ? leads.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={(e) => setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(l.id); else next.delete(l.id);
                        return next;
                      })}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.full_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div>{l.phone ?? "-"}</div>
                    <div>{l.email ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.budget_max ? fmtMoney(l.budget_max, l.currency) : "-"}</td>
                  <td className="px-4 py-3 text-xs">{l.preferred_locations?.join(", ") ?? "-"}</td>
                  <td className="px-4 py-3 text-xs">{l.preferred_property_types?.join(", ") ?? "-"}</td>
                  <td className="px-4 py-3 text-xs">
                    {intentByLead.has(l.id) ? (
                      <IntentScore score={intentByLead.get(l.id)} />
                    ) : (
                      <span className="text-muted-foreground" title="Run AI analysis to score this lead">Not analysed</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><PipelineStageBadge stage={stageLabelFrom(stages, l.pipeline_stage)} /></td>
                  <td className="px-4 py-3 text-xs">
                    {canAssign ? (
                      <SelectField
                        value={l.assigned_agent_id}
                        onChange={(v) => assignAgent(l.id, v)}
                        options={team.filter((m) => m.is_active !== false).map((m) => ({ value: m.id, label: m.full_name }))}
                        emptyLabel="Unassigned"
                        className="h-8 max-w-[150px] text-xs"
                        aria-label={`Assign agent for ${l.full_name}`}
                      />
                    ) : (
                      agentName(l.assigned_agent_id)
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(l.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button className="rounded-md p-1.5 hover:bg-muted" title="Edit" onClick={() => { setEditLead(l); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button className="rounded-md p-1.5 hover:bg-muted" title="Archive" onClick={() => setConfirmArchive(l)}>
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button className="rounded-md p-1.5 hover:bg-muted text-destructive" title="Delete" onClick={() => setConfirmDelete(l)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            : null}
        </DataTable>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leads.length === 0 ? (
            <div className="col-span-full">
              <EmptyState icon={<Users className="h-4 w-4" />} title="No leads yet" description="Add a lead to see cards here." />
            </div>
          ) : (
            leads.map((l) => (
              <Link key={l.id} to="/leads/$leadId" params={{ leadId: l.id }} className="rounded-2xl border border-border bg-canvas p-5 hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{l.full_name}</h4>
                  <PipelineStageBadge stage={stageLabelFrom(stages, l.pipeline_stage)} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{l.phone ?? l.email ?? "-"}</p>
                <p className="mt-3 text-xs"><strong>Budget:</strong> {fmtMoney(l.budget_max, l.currency)}</p>
                <p className="text-xs"><strong>Area:</strong> {l.preferred_locations?.join(", ") ?? "-"}</p>
              </Link>
            ))
          )}
        </div>
      )}

      <AddLeadDrawer open={open} onOpenChange={setOpen} lead={editLead} />
      <LeadImporter open={importerOpen} onOpenChange={setImporterOpen} />
      <BroadcastDialog
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        leads={leads.filter((l) => selected.has(l.id))}
        onDone={() => setSelected(new Set())}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        title="Archive lead?"
        description={`Archive ${confirmArchive?.full_name}? You can restore it later.`}
        confirmLabel="Archive"
        pending={archive.isPending}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={async () => {
          if (!confirmArchive) return;
          try {
            await archive.mutateAsync(confirmArchive.id);
            toast.success("Lead archived");
          } catch (e) { toast.error((e as Error).message); }
          setConfirmArchive(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Permanently delete lead?"
        description={`Delete ${confirmDelete?.full_name}. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await del.mutateAsync(confirmDelete.id);
            toast.success("Lead deleted");
          } catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}
// Silence unused import lint:
void FilterBar; void FilterPill;

// Broadcasts through EACH lead's assigned agent's OWN WhatsApp connection -
// the caller can only successfully send for leads assigned to themselves
// (whatsapp-send resolves the connection from the signed-in caller), so this
// is naturally scoped per-agent rather than a global sender. Failures per
// recipient (e.g. a lead assigned to a different, unconnected agent) are
// reported individually rather than blocking the whole batch.
function BroadcastDialog({
  open,
  onOpenChange,
  leads,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  onDone: () => void;
}) {
  const send = useSendWhatsapp();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    const out: { name: string; ok: boolean; error?: string }[] = [];
    for (const l of leads) {
      if (!l.phone) { out.push({ name: l.full_name, ok: false, error: "No phone number" }); continue; }
      try {
        await send.mutateAsync({ lead_id: l.id, to: l.phone, message: message.trim() });
        out.push({ name: l.full_name, ok: true });
      } catch (e) {
        out.push({ name: l.full_name, ok: false, error: (e as Error).message });
      }
    }
    setResults(out);
    setSending(false);
  }

  return (
    <DialogShell open={open} onOpenChange={(v) => { if (!sending) { onOpenChange(v); if (!v) { setMessage(""); setResults(null); } } }} widthClassName="max-w-lg" ariaLabel="WhatsApp broadcast">
      <div className="p-5">
        <h3 className="text-base font-semibold">WhatsApp Broadcast</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sends via each recipient's assigned agent's own WhatsApp Business connection - there is no shared sender.
          Sending only succeeds for leads assigned to your own connected number.
        </p>
        <p className="mt-2 text-xs font-medium">{leads.length} recipient{leads.length === 1 ? "" : "s"} selected</p>

        {!results ? (
          <>
            <textarea
              className="mt-3 h-28 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              placeholder="Message (respect Meta's 24h/template rules for first contact)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" disabled={sending || !message.trim()} onClick={handleSend}>{sending ? "Sending..." : "Send"}</Button>
            </div>
          </>
        ) : (
          <>
            <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">
              {results.map((r, i) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-border px-2 py-1">
                  <span>{r.name}</span>
                  <span className={r.ok ? "text-foreground" : "text-destructive"}>{r.ok ? "Sent" : r.error}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => { onOpenChange(false); onDone(); }}>Done</Button>
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
