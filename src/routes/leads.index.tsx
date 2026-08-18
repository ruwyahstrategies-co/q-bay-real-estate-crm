import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Upload, LayoutGrid, Rows3, Users, Pencil, Archive, Trash2 } from "lucide-react";
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
import { PipelineStageBadge } from "@/components/status-badge";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { cn } from "@/lib/utils";
import { useArchiveLead, useDeleteLead, useLeads } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtMoney, fmtDate, type Lead } from "@/lib/db";

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
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Lead | null>(null);

  const { data: leads = [], isLoading } = useLeads({ search, stage, agent });
  const { data: team = [] } = useTeamMembers();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const archive = useArchiveLead();
  const del = useDeleteLead();
  const agentName = (id: string | null) => team.find((t) => t.id === id)?.full_name ?? "Unassigned";
  const { can } = usePermissions();
  const canCreate = can("leads", "create");
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");

  return (
    <AppShell>
      <PermissionGate module="leads" action="view" page>
      <PageHeader
        eyebrow="Buyers"
        title="All Leads"
        description="Centralised buyer database with intent, budget and stage."
        actions={
          <>
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
            placeholder="Search by name, phone, email--¦"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={stage ?? ""}
          onChange={(e) => setStage(e.target.value || null)}
          className="h-9 rounded-lg border border-border bg-canvas px-3 text-xs"
        >
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.stage_key}>{s.name}</option>
          ))}
        </select>
        <select
          value={agent ?? ""}
          onChange={(e) => setAgent(e.target.value || null)}
          className="h-9 rounded-lg border border-border bg-canvas px-3 text-xs"
        >
          <option value="">All agents</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "table" && "bg-canvas")} onClick={() => setView("table")} aria-label="Table view">
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "cards" && "bg-canvas")} onClick={() => setView("cards")} aria-label="Card view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <DataTable
          columns={["Buyer", "Contact", "Budget", "Preferred Area", "Property Type", "Intent Score", "Pipeline Stage", "Assigned Agent", "Last Contact", "Actions"]}
          empty={
            isLoading ? (
              <EmptyState title="Loading leads--¦" />
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
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.full_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div>{l.phone ?? "---"}</div>
                    <div>{l.email ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.budget_max ? fmtMoney(l.budget_max, l.currency) : "---"}</td>
                  <td className="px-4 py-3 text-xs">{l.preferred_locations?.join(", ") ?? "---"}</td>
                  <td className="px-4 py-3 text-xs">{l.preferred_property_types?.join(", ") ?? "---"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title="AI analysis required">Not analysed</td>
                  <td className="px-4 py-3"><PipelineStageBadge stage={stageLabelFrom(stages, l.pipeline_stage)} /></td>
                  <td className="px-4 py-3 text-xs">{agentName(l.assigned_agent_id)}</td>
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
                <p className="mt-1 text-xs text-muted-foreground">{l.phone ?? l.email ?? "---"}</p>
                <p className="mt-3 text-xs"><strong>Budget:</strong> {fmtMoney(l.budget_max, l.currency)}</p>
                <p className="text-xs"><strong>Area:</strong> {l.preferred_locations?.join(", ") ?? "---"}</p>
              </Link>
            ))
          )}
        </div>
      )}

      <AddLeadDrawer open={open} onOpenChange={setOpen} lead={editLead} />
      <LeadImporter open={importerOpen} onOpenChange={setImporterOpen} />
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
