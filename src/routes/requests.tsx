import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RequestDrawer } from "@/components/request-drawer";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useStaffRequests, useUpdateStaffRequest } from "@/hooks/use-staff-requests";
import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  fmtDateTime,
  type StaffRequest,
} from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/requests")({
  head: () => ({ meta: [{ title: "Requests" }] }),
  component: RequestsPage,
});

type Scope = "mine" | "assigned" | "team" | "all";

const STATUS_VARIANT: Record<string, "blue" | "purple" | "amber" | "green" | "slate"> = {
  submitted: "blue",
  in_review: "purple",
  in_progress: "amber",
  completed: "green",
  closed: "slate",
};

const inputCls =
  "rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function RequestsPage() {
  const { can } = usePermissions();
  const { teamMember: me } = useCurrentUser();
  const { data: requests = [], isLoading } = useStaffRequests();
  const { data: team = [] } = useTeamMembers();

  const canCreate = can("requests", "create");
  const seesAll = can("requests", "view_all");
  const seesTeam = can("requests", "view_team");
  const scopeOptions: { value: Scope; label: string }[] = [
    { value: "mine", label: "My requests" },
    { value: "assigned", label: "Assigned to me" },
    ...(seesTeam || seesAll ? [{ value: "team" as Scope, label: "My team" }] : []),
    ...(seesAll ? [{ value: "all" as Scope, label: "Everything I can see" }] : []),
  ];
  const [scope, setScope] = useState<Scope>(seesAll ? "all" : seesTeam ? "team" : "mine");
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRequest | null>(null);
  const [withdrawing, setWithdrawing] = useState<StaffRequest | null>(null);
  const update = useUpdateStaffRequest();

  const nameOf = (id: string | null) => team.find((t) => t.id === id)?.full_name ?? null;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (scope === "mine" && r.requested_by !== me?.id) return false;
      if (scope === "assigned" && r.assigned_to !== me?.id) return false;
      if (scope === "team" && !(me?.team_id && r.team_id === me.team_id)) return false;
      if (status && r.status !== status) return false;
      if (term && !`${r.title} ${r.description ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [requests, scope, status, search, me?.id, me?.team_id]);

  const open = requests.filter((r) => r.status !== "completed" && r.status !== "closed").length;

  /** Mirrors the database rule for who may manage a request. The database decides for real. */
  function canManage(r: StaffRequest): boolean {
    if (!can("requests", "manage")) return false;
    if (seesAll) return true;
    if (seesTeam && me?.team_id && r.team_id === me.team_id) return true;
    return !!me?.id && r.assigned_to === me.id;
  }

  async function withdraw() {
    if (!withdrawing) return;
    try {
      await update.mutateAsync({ id: withdrawing.id, patch: { status: "closed" } });
      toast.success("Request withdrawn");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setWithdrawing(null);
  }

  return (
    <AppShell>
      <PermissionGate module="requests" action="view" page>
        <PageHeader
          eyebrow="Operations"
          title="Requests"
          description="Send a request to management and follow it until it is done."
          actions={
            canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDrawerOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New Request
              </Button>
            ) : undefined
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests..."
            className={cn(inputCls, "h-9 min-w-[180px] flex-1 bg-background")}
          />
          <SelectField
            value={scope}
            onChange={(v) => setScope((v as Scope) ?? "mine")}
            options={scopeOptions}
            allowClear={false}
            className="w-52"
          />
          <SelectField
            value={status}
            onChange={setStatus}
            options={REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABELS[s] }))}
            emptyLabel="All statuses"
            className="w-44"
          />
          <span className="px-2 text-xs text-muted-foreground">{open} open</span>
        </div>

        {isLoading ? (
          <EmptyState title="Loading..." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-4 w-4" />}
            title={requests.length === 0 ? "No requests yet" : "No requests match these filters"}
            description={
              requests.length === 0 && canCreate
                ? "Use New Request to send something to management, for example a document, a property change or a CRM problem."
                : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {visible.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                requesterName={nameOf(r.requested_by)}
                assigneeName={nameOf(r.assigned_to)}
                resolvedByName={nameOf(r.resolved_by)}
                mine={r.requested_by === me?.id}
                canManage={canManage(r)}
                team={team
                  .filter((t) => t.is_active !== false)
                  .map((t) => ({ value: t.id, label: t.full_name }))}
                onEdit={() => {
                  setEditing(r);
                  setDrawerOpen(true);
                }}
                onWithdraw={() => setWithdrawing(r)}
              />
            ))}
          </div>
        )}

        <RequestDrawer open={drawerOpen} onOpenChange={setDrawerOpen} request={editing} />
        <ConfirmDialog
          open={!!withdrawing}
          title="Withdraw this request?"
          description="It will be closed and management will no longer act on it. You can send a new one any time."
          confirmLabel="Withdraw"
          pending={update.isPending}
          onCancel={() => setWithdrawing(null)}
          onConfirm={withdraw}
        />
      </PermissionGate>
    </AppShell>
  );
}

function RequestCard({
  request: r,
  requesterName,
  assigneeName,
  resolvedByName,
  mine,
  canManage,
  team,
  onEdit,
  onWithdraw,
}: {
  request: StaffRequest;
  requesterName: string | null;
  assigneeName: string | null;
  resolvedByName: string | null;
  mine: boolean;
  canManage: boolean;
  team: { value: string; label: string }[];
  onEdit: () => void;
  onWithdraw: () => void;
}) {
  const [managing, setManaging] = useState(false);
  const closed = r.status === "completed" || r.status === "closed";
  const canEditOwn = mine && r.status === "submitted";

  return (
    <Card className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{r.title}</h4>
            <StatusBadge variant={STATUS_VARIANT[r.status] ?? "neutral"}>
              {REQUEST_STATUS_LABELS[r.status] ?? titleCase(r.status)}
            </StatusBadge>
            {(r.priority === "high" || r.priority === "urgent") && (
              <StatusBadge variant={r.priority === "urgent" ? "red" : "orange"}>
                {titleCase(r.priority)}
              </StatusBadge>
            )}
            <StatusBadge>
              {REQUEST_CATEGORY_LABELS[r.category] ?? titleCase(r.category)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {mine ? "Sent by you" : `Sent by ${requesterName ?? "a former team member"}`} on{" "}
            {fmtDateTime(r.created_at)}
            {assigneeName ? ` · Assigned to ${assigneeName}` : ""}
            {closed && r.resolved_at
              ? ` · ${r.status === "completed" ? "Completed" : "Closed"} ${fmtDateTime(r.resolved_at)}${resolvedByName ? ` by ${resolvedByName}` : ""}`
              : ""}
          </p>
          {r.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {r.description}
            </p>
          )}
          {r.response_notes && (
            <div className="mt-3 rounded-lg border border-qbay/25 bg-qbay-tint p-3 text-xs">
              <p className="font-medium">Response</p>
              <p className="mt-0.5 whitespace-pre-wrap">{r.response_notes}</p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEditOwn && (
            <>
              <Button size="sm" variant="outline" onClick={onEdit}>
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={onWithdraw}>
                Withdraw
              </Button>
            </>
          )}
          {canManage && (
            <Button
              size="sm"
              variant={managing ? "secondary" : "outline"}
              onClick={() => setManaging((v) => !v)}
            >
              {managing ? "Hide" : "Respond / Manage"}
            </Button>
          )}
        </div>
      </div>
      {managing && canManage && (
        <ManagePanel request={r} team={team} onSaved={() => setManaging(false)} />
      )}
    </Card>
  );
}

function ManagePanel({
  request: r,
  team,
  onSaved,
}: {
  request: StaffRequest;
  team: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const update = useUpdateStaffRequest();
  const [status, setStatus] = useState(r.status);
  const [assignedTo, setAssignedTo] = useState<string | null>(r.assigned_to);
  const [response, setResponse] = useState(r.response_notes ?? "");

  const changed =
    status !== r.status ||
    assignedTo !== r.assigned_to ||
    response.trim() !== (r.response_notes ?? "");

  async function save() {
    try {
      await update.mutateAsync({
        id: r.id,
        patch: {
          status,
          assigned_to: assignedTo,
          response_notes: response.trim() || null,
        },
      });
      toast.success("Request updated");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        <SelectField
          value={status}
          onChange={(v) => setStatus(v ?? r.status)}
          options={REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABELS[s] }))}
          allowClear={false}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Assigned to
        </span>
        <SearchableSelectField
          value={assignedTo}
          onChange={setAssignedTo}
          options={team}
          placeholder="Search staff"
          emptyLabel="Unassigned"
          searchPlaceholder="Search staff..."
        />
      </div>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Response or resolution notes
        </span>
        <textarea
          className={cn(inputCls, "h-24 py-2")}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="What was decided or done. The requester sees this."
        />
      </label>
      <div className="flex justify-end sm:col-span-2">
        <Button size="sm" disabled={!changed || update.isPending} onClick={save}>
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
