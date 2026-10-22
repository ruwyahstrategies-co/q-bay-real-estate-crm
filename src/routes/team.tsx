import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserCog, Plus, Pencil, Trash2, ShieldCheck, Users, Wallet, Trophy, XCircle, Percent } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { DataTable, dataRowCls } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { StaffAvatar } from "@/components/staff-avatar";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { TeamMemberDrawer } from "@/components/team-member-drawer";
import { TeamsManager } from "@/components/teams-manager";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReassignmentDialog } from "@/components/reassignment-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers, useDeleteTeamMember, useUpdateTeamMember } from "@/hooks/use-team";
import { useLeads } from "@/hooks/use-leads";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { metricMoney } from "@/lib/metric-format";
import { hasDominantBudget, largestShare, summariseBudgets } from "@/lib/lead-budgets";
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
  const [reassignTarget, setReassignTarget] = useState<StaffTeamMember | null>(null);
  const [pendingAction, setPendingAction] = useState<"deactivate" | "delete" | null>(null);
  const { data: team = [] } = useTeamMembers();
  const { data: leads = [] } = useLeads({ status: "active" });
  const del = useDeleteTeamMember();
  const update = useUpdateTeamMember();
  const { can } = usePermissions();
  const canManage = can("team", "manage");

  const { data: stages = [] } = usePipelineStages();
  // Won and Lost come from the pipeline settings; the two built-in keys are the fallback.
  const wonKeys = new Set(stages.filter((s) => s.is_won).map((s) => s.stage_key));
  const lostKeys = new Set(stages.filter((s) => s.is_lost).map((s) => s.stage_key));
  if (wonKeys.size === 0) wonKeys.add("won");
  if (lostKeys.size === 0) lostKeys.add("lost");
  const isOpen = (stage: string) => !wonKeys.has(stage) && !lostKeys.has(stage);

  // What this page can total is limited to the leads the signed-in person is allowed to see.
  const scopeLabel = can("leads", "view_all") ? "all leads" : can("leads", "view_team") ? "your team's leads" : "your leads";

  function leadCount(id: string) {
    return leads.filter((l) => l.assigned_agent_id === id).length;
  }
  /** Maximum budgets of one member's open sale leads (a rent budget is a different kind of number). */
  function openSaleBudget(id: string) {
    const groups = summariseBudgets(leads.filter((l) => l.assigned_agent_id === id && isOpen(l.pipeline_stage)));
    const g = groups.find((x) => x.intent === "sale");
    return g && g.total > 0 ? { ...metricMoney(g.total, g.currency), group: g } : null;
  }
  function closedDeals(id: string) {
    return leads.filter((l) => l.assigned_agent_id === id && wonKeys.has(l.pipeline_stage)).length;
  }

  const totalAssigned = leads.filter((l) => l.assigned_agent_id).length;
  const openLeads = leads.filter((l) => isOpen(l.pipeline_stage));
  const budgetGroups = summariseBudgets(openLeads);
  // The headline is the biggest sale group. Other currencies and rent budgets stay in the tooltip.
  const headline = budgetGroups.find((g) => g.intent === "sale") ?? budgetGroups[0] ?? null;
  const headlineMoney = headline && headline.total > 0 ? metricMoney(headline.total, headline.currency) : null;
  const budgetDetails = budgetGroups
    .filter((g) => g.total > 0)
    .map(
      (g) =>
        `${g.intent === "sale" ? "Sale" : "Rent"} ${metricMoney(g.total, g.currency).exact} (${g.withBudget} of ${g.leads} leads have a budget${hasDominantBudget(g) ? `, one budget is ${largestShare(g)}% of it` : ""})`,
    )
    .join("\n");
  const totalClosed = leads.filter((l) => wonKeys.has(l.pipeline_stage)).length;
  const totalLost = leads.filter((l) => lostKeys.has(l.pipeline_stage)).length;
  const conv = totalClosed + totalLost > 0 ? `${Math.round((totalClosed / (totalClosed + totalLost)) * 100)}%` : "-";

  const metrics = [
    { label: "Team members", value: String(team.length), icon: <UserCog />, tone: "green" as const },
    { label: "Assigned leads", value: String(totalAssigned), icon: <Users />, tone: "blue" as const },
    {
      label: "Open lead budgets",
      value: headlineMoney?.value ?? "-",
      title: budgetDetails || undefined,
      hint: headline
        ? `${headline.intent === "sale" ? "Sale" : "Rent"} leads, maximum budget. Not revenue. ${headline.withBudget} of ${headline.leads} have a budget. Counts ${scopeLabel}.`
        : `Maximum budget of open leads. Not revenue. Counts ${scopeLabel}.`,
      icon: <Wallet />,
      tone: "cream" as const,
    },
    { label: "Leads won", value: String(totalClosed), icon: <Trophy />, tone: "green" as const },
    { label: "Leads lost", value: String(totalLost), icon: <XCircle />, tone: "purple" as const },
    { label: "Win rate", value: conv, icon: <Percent />, tone: "blue" as const },
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
          <MetricCard key={m.label} label={m.label} value={m.value} icon={m.icon} tone={m.tone} title={m.title} hint={m.hint} />
        ))}
      </div>

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-1 text-base font-semibold">Teams</h3>
          <TeamsManager />
        </Card>
      )}

      <DataTable
        columns={["Member", "Role", "Login", "Status", "Assigned leads", "Open sale budgets", "Leads won", "Actions"]}
        empty={<EmptyState icon={<UserCog className="h-4 w-4" />} title="No team members yet" description="Add agents to start assigning leads." />}
      >
        {team.length > 0
          ? team.map((m) => (
              <tr key={m.id} className={dataRowCls}>
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-3">
                    <StaffAvatar name={m.full_name} url={m.avatar_url} size="md" />
                    <div className="min-w-0">
                      <div className="truncate">{m.full_name}</div>
                      <div className="truncate text-xs font-normal text-muted-foreground">{m.email ?? m.phone ?? ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <StatusBadge variant="slate">{isRolePresetKey(m.role) ? ROLE_PRESETS[m.role].label : (m.role ?? "-")}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-xs">
                  {m.user_id ? (
                    <span className="inline-flex items-center gap-1 text-foreground"><ShieldCheck className="h-3 w-3" /> Has login</span>
                  ) : (
                    <span className="text-muted-foreground">No login</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <button
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-default ${m.is_active ? "bg-pastel-green" : "bg-muted text-muted-foreground"}`}
                    disabled={!canManage}
                    aria-label={m.is_active ? `Deactivate ${m.full_name}` : `Reactivate ${m.full_name}`}
                    onClick={async () => {
                      // Reactivating needs no reassignment check. Deactivating does:
                      // route through the same reassignment dialog the delete icon uses,
                      // so an agent's leads/properties/tasks are never silently orphaned.
                      if (!m.is_active) {
                        try { await update.mutateAsync({ id: m.id, patch: { is_active: true } }); }
                        catch (e) { toast.error((e as Error).message); }
                        return;
                      }
                      setReassignTarget(m);
                    }}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs">{leadCount(m.id)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">
                  {(() => {
                    const b = openSaleBudget(m.id);
                    return b ? <span title={b.exact}>{b.value}</span> : "-";
                  })()}
                </td>
                <td className="px-4 py-3 text-xs">{closedDeals(m.id)}</td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button className="rounded-md p-1.5 hover:bg-muted" title="Edit" aria-label={`Edit ${m.full_name}`} onClick={() => { setEdit(m); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className="rounded-md p-1.5 hover:bg-muted text-destructive" title="Remove" aria-label={`Remove ${m.full_name}`} onClick={() => setReassignTarget(m)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          : null}
      </DataTable>

      {canManage && <TeamMemberDrawer open={open} onOpenChange={setOpen} member={edit} />}
      <ReassignmentDialog
        open={!!reassignTarget}
        onOpenChange={(v) => !v && setReassignTarget(null)}
        member={reassignTarget}
        onProceed={async (action) => {
          if (!reassignTarget) return;
          if (action === "deactivate") {
            try {
              await update.mutateAsync({ id: reassignTarget.id, patch: { is_active: false } });
              toast.success("Team member deactivated");
            } catch (e) { toast.error((e as Error).message); }
            setReassignTarget(null);
          } else {
            setConfirmDelete(reassignTarget);
            setPendingAction("delete");
            setReassignTarget(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete && pendingAction === "delete"}
        title="Permanently delete team member?"
        description={`Delete ${confirmDelete?.full_name}. This cannot be undone. Any records not reassigned in the previous step are now unassigned.`}
        confirmLabel="Delete permanently"
        destructive
        pending={del.isPending}
        onCancel={() => { setConfirmDelete(null); setPendingAction(null); }}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Team member deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
          setPendingAction(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}
