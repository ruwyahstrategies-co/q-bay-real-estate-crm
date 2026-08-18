import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserCog, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { TeamMemberDrawer } from "@/components/team-member-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers, useDeleteTeamMember, useUpdateTeamMember } from "@/hooks/use-team";
import { useLeads } from "@/hooks/use-leads";
import { fmtMoney } from "@/lib/db";
import type { StaffTeamMember } from "@/lib/db-extensions";
import { ROLE_PRESETS, isRolePresetKey } from "@/lib/permissions";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Team" }] }),
  component: TeamPage,
});

function TeamPage() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<StaffTeamMember | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffTeamMember | null>(null);
  const { data: team = [] } = useTeamMembers();
  const { data: leads = [] } = useLeads({ status: "active" });
  const del = useDeleteTeamMember();
  const update = useUpdateTeamMember();
  const { can } = usePermissions();
  const canManage = can("team", "manage");

  function leadCount(id: string) {
    return leads.filter((l) => l.assigned_agent_id === id).length;
  }
  function pipelineValue(id: string) {
    return leads
      .filter((l) => l.assigned_agent_id === id && !["won", "lost"].includes(l.pipeline_stage))
      .reduce((acc, l) => acc + (l.budget_max ?? 0), 0);
  }
  function closedDeals(id: string) {
    return leads.filter((l) => l.assigned_agent_id === id && l.pipeline_stage === "won").length;
  }

  const totalAssigned = leads.filter((l) => l.assigned_agent_id).length;
  const totalPipeline = leads
    .filter((l) => !["won", "lost"].includes(l.pipeline_stage))
    .reduce((acc, l) => acc + (l.budget_max ?? 0), 0);
  const totalClosed = leads.filter((l) => l.pipeline_stage === "won").length;
  const totalLost = leads.filter((l) => l.pipeline_stage === "lost").length;
  const conv = totalClosed + totalLost > 0 ? `${Math.round((totalClosed / (totalClosed + totalLost)) * 100)}%` : "---";

  const metrics = [
    { label: "Team members", value: String(team.length) },
    { label: "Assigned leads", value: String(totalAssigned) },
    { label: "Pipeline value", value: totalPipeline > 0 ? fmtMoney(totalPipeline, leads[0]?.currency) : "---" },
    { label: "Closed deals", value: String(totalClosed) },
    { label: "Lost deals", value: String(totalLost) },
    { label: "Conversion rate", value: conv },
  ];

  return (
    <AppShell>
      <PermissionGate module="team" action="view" page>
      <PageHeader
        eyebrow="People"
        title="Team"
        description="Manage agents, staff logins and permissions."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add member
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="mt-3 text-xl font-semibold">{m.value}</p>
          </Card>
        ))}
      </div>

      <DataTable
        columns={["Member", "Role", "Login", "Status", "Assigned leads", "Pipeline value", "Closed deals", "Actions"]}
        empty={<EmptyState icon={<UserCog className="h-4 w-4" />} title="No team members yet" description="Add agents to start assigning leads." />}
      >
        {team.length > 0
          ? team.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-background/60">
                <td className="px-4 py-3 text-sm font-medium">
                  <div>{m.full_name}</div>
                  <div className="text-xs text-muted-foreground">{m.email ?? m.phone ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{isRolePresetKey(m.role) ? ROLE_PRESETS[m.role].label : (m.role ?? "---")}</td>
                <td className="px-4 py-3 text-xs">
                  {m.user_id ? (
                    <span className="inline-flex items-center gap-1 text-foreground"><ShieldCheck className="h-3 w-3" /> Has login</span>
                  ) : (
                    <span className="text-muted-foreground">No login</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <button
                    className={`rounded-full px-2 py-0.5 text-[11px] ${m.is_active ? "bg-pastel-green" : "bg-muted"}`}
                    disabled={!canManage}
                    onClick={async () => {
                      try { await update.mutateAsync({ id: m.id, patch: { is_active: !m.is_active } }); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs">{leadCount(m.id)}</td>
                <td className="px-4 py-3 text-xs">{pipelineValue(m.id) > 0 ? fmtMoney(pipelineValue(m.id), "QAR") : "---"}</td>
                <td className="px-4 py-3 text-xs">{closedDeals(m.id)}</td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(m); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(m)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          : null}
      </DataTable>

      {canManage && <TeamMemberDrawer open={open} onOpenChange={setOpen} member={edit} />}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete team member?"
        description={`Delete ${confirmDelete?.full_name}. Assigned leads will become unassigned.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Team member deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}
