import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { Plus, LayoutGrid, Rows3, ArrowUpRight, Users, ClipboardPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable, dataRowCls } from "@/components/data-table";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton, ToolbarAlways } from "@/components/filter-toolbar";
import { StaffAvatar } from "@/components/staff-avatar";
import { EmptyState } from "@/components/empty-state";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useLeads, useChangePipelineStage } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { MaskedPhone } from "@/components/masked-phone";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TaskDrawer } from "@/components/task-drawer";
import { blockedMoveReason, isClosedStage } from "@/lib/pipeline";
import { fmtMoney, type Lead } from "@/lib/db";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [agent, setAgent] = useState<string | null>(null);
  const { data: leads = [] } = useLeads({ search, agent });
  const { data: team = [] } = useTeamMembers();
  const { data: pipelineStages = [] } = usePipelineStages({ activeOnly: true });
  const changeStage = useChangePipelineStage();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { can } = usePermissions();
  const canMove = can("pipeline", "move");
  const canCreateLead = can("leads", "create");
  const canCreateTask = can("tasks", "create");
  // A move into Won or Lost closes the lead for good, so it is confirmed first.
  const [pendingClose, setPendingClose] = useState<{ lead: Lead; target: string } | null>(null);
  const [taskLead, setTaskLead] = useState<Lead | null>(null);

  // Local optimistic copy of leads' stages
  const [localStage, setLocalStage] = useState<Record<string, string>>({});
  const merged = useMemo(
    () => leads.map((l) => ({ ...l, pipeline_stage: localStage[l.id] ?? l.pipeline_stage })),
    [leads, localStage],
  );

  async function moveLead(lead: Lead, targetStage: string) {
    const prev = lead.pipeline_stage;
    setLocalStage((m) => ({ ...m, [lead.id]: targetStage }));
    try {
      await changeStage.mutateAsync({ id: lead.id, newStage: targetStage, previousStage: prev });
    } catch (err) {
      // The database is the final judge of the forward-only rule, so a refusal puts the card back.
      setLocalStage((m) => {
        const c = { ...m };
        delete c[lead.id];
        return c;
      });
      toast.error((err as Error).message);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    if (!canMove || !e.over) return;
    const leadId = String(e.active.id);
    const targetStage = String(e.over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.pipeline_stage === targetStage) return;
    const reason = blockedMoveReason(pipelineStages, lead.pipeline_stage, targetStage);
    if (reason) {
      toast.error(reason);
      return;
    }
    if (isClosedStage(pipelineStages, targetStage)) {
      setPendingClose({ lead, target: targetStage });
      return;
    }
    await moveLead(lead, targetStage);
  }

  return (
    <AppShell>
      <PermissionGate module="pipeline" action="view" page>
      <PageHeader
        eyebrow="Sales"
        title="Pipeline"
        description={canMove ? "Drag-and-drop pipeline across every stage." : "Pipeline overview (read-only)."}
        actions={
          canCreateLead ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Button>
          ) : undefined
        }
      />

      <FilterToolbar ariaLabel="Pipeline filters" activeCount={(search.trim() ? 1 : 0) + (agent ? 1 : 0)}>
        <FilterSearch value={search} onChange={setSearch} placeholder="Search leads in pipeline..." />
        <FilterSelect
          label="Agent"
          value={agent}
          onChange={setAgent}
          options={team.map((m) => ({ value: m.id, label: m.full_name }))}
          allLabel="All agents"
          searchable
        />
        <ClearFiltersButton
          count={(search.trim() ? 1 : 0) + (agent ? 1 : 0)}
          onClick={() => {
            setSearch("");
            setAgent(null);
          }}
        />
        <ToolbarAlways>
          <SegmentedControl
            ariaLabel="View"
            size="md"
            className="ml-auto"
            value={view}
            onChange={setView}
            options={[
              { value: "board", ariaLabel: "Board view", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { value: "list", ariaLabel: "List view", icon: <Rows3 className="h-3.5 w-3.5" /> },
            ]}
          />
        </ToolbarAlways>
      </FilterToolbar>

      {view === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
            {pipelineStages.map((stage) => {
              const items = merged.filter((l) => l.pipeline_stage === stage.stage_key);
              const total = items.reduce((acc, l) => acc + (l.budget_max ?? 0), 0);
              return (
                <StageColumn
                  key={stage.id}
                  stageKey={stage.stage_key}
                  label={stage.name}
                  color={stage.color}
                  items={items}
                  total={total}
                  droppable={canMove}
                  team={team}
                  stages={pipelineStages}
                  onAddTask={canCreateTask ? setTaskLead : undefined}
                />
              );
            })}
          </div>
        </DndContext>
      ) : (
        <DataTable
          columns={["Buyer", "Stage", "Value", "Assigned", "Last update"]}
          empty={<EmptyState compact title="No leads in pipeline yet" description="Add leads to start tracking progression." />}
        >
          {merged.length > 0
            ? merged.map((l) => (
                <tr key={l.id} className={dataRowCls}>
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline">{l.full_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs">{pipelineStages.find((s) => s.stage_key === l.pipeline_stage)?.name ?? l.pipeline_stage.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs">{fmtMoney(l.budget_max, l.currency)}</td>
                  <td className="px-4 py-3 text-xs">{team.find((t) => t.id === l.assigned_agent_id)?.full_name ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.updated_at).toLocaleDateString()}</td>
                </tr>
              ))
            : null}
        </DataTable>
      )}

      <AddLeadDrawer open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={!!pendingClose}
        title={`Close ${pendingClose?.lead.full_name ?? "this lead"} as ${pipelineStages.find((x) => x.stage_key === pendingClose?.target)?.name ?? "closed"}?`}
        description="A closed lead cannot be moved back into the pipeline. Check the stage before you confirm."
        confirmLabel="Close lead"
        destructive={!!pipelineStages.find((x) => x.stage_key === pendingClose?.target)?.is_lost}
        pending={changeStage.isPending}
        onCancel={() => setPendingClose(null)}
        onConfirm={async () => {
          if (!pendingClose) return;
          const { lead, target } = pendingClose;
          setPendingClose(null);
          await moveLead(lead, target);
        }}
      />
      <TaskDrawer
        open={!!taskLead}
        onOpenChange={(v) => !v && setTaskLead(null)}
        defaultLeadId={taskLead?.id}
        defaultTitle={taskLead ? `Follow up: ${taskLead.full_name}` : undefined}
        source="pipeline"
        sourceRef={taskLead?.id}
      />
      </PermissionGate>
    </AppShell>
  );
}

type StaffLite = { id: string; full_name: string; avatar_url: string | null };

function StageColumn({
  stageKey,
  label,
  color,
  items,
  total,
  droppable,
  team,
  stages,
  onAddTask,
}: {
  stageKey: string;
  label: string;
  /** Optional color tag configured on the stage in Settings; Q-Bay green when not set. */
  color: string | null;
  items: Lead[];
  total: number;
  droppable: boolean;
  team: StaffLite[];
  stages: { stage_key: string; position: number; is_won: boolean; is_lost: boolean }[];
  onAddTask?: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] flex-shrink-0 flex-col rounded-xl border p-3 transition-colors duration-150",
        isOver ? "border-qbay bg-qbay-tint ring-2 ring-qbay/15" : "border-border bg-muted/50",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ background: color || "var(--qbay-green)" }}
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground shadow-card">
          {items.length}
        </span>
      </div>
      <div className="flex-1 space-y-2">
        {items.length === 0 ? (
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-[11px] transition-colors duration-150",
              isOver ? "border-qbay/50 bg-canvas text-qbay" : "border-border bg-canvas/60 text-muted-foreground",
            )}
          >
            {isOver ? "Drop here" : "No leads in this stage"}
          </div>
        ) : (
          items.map((l) => (
            <DraggableCard
              key={l.id}
              lead={l}
              // Closed (Won / Lost) leads are locked: they cannot be moved again.
              draggable={droppable && !isClosedStage(stages, l.pipeline_stage)}
              closed={isClosedStage(stages, l.pipeline_stage)}
              agent={team.find((t) => t.id === l.assigned_agent_id) ?? null}
              onAddTask={onAddTask}
            />
          ))
        )}
      </div>
      <p className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Total value</span>
        <span className="font-medium tabular-nums text-foreground">
          {total > 0 ? fmtMoney(total, items[0]?.currency) : "-"}
        </span>
      </p>
    </div>
  );
}

function DraggableCard({
  lead,
  draggable,
  closed,
  agent,
  onAddTask,
}: {
  lead: Lead;
  draggable: boolean;
  closed: boolean;
  agent: StaffLite | null;
  onAddTask?: (lead: Lead) => void;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, disabled: !draggable });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  function open() {
    navigate({ to: "/leads/$leadId", params: { leadId: lead.id } });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(draggable ? listeners : {})}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${lead.full_name}`}
      className={cn(
        "group relative rounded-xl border border-border bg-canvas p-3 shadow-card transition duration-150 hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "z-10 opacity-90 shadow-pop",
      )}
    >
      {closed ? (
        <Lock aria-label="Closed lead" className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <ArrowUpRight className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
      <p className="truncate pr-5 text-sm font-medium">{lead.full_name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.phone ? <MaskedPhone value={lead.phone} /> : (lead.email ?? "")}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tabular-nums">{fmtMoney(lead.budget_max, lead.currency)}</span>
        {onAddTask && (
          <button
            type="button"
            aria-label={`Add task for ${lead.full_name}`}
            title="Add task"
            // Do not start a drag or open the lead when this button is used.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(lead);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ClipboardPlus className="h-3.5 w-3.5" />
          </button>
        )}
        {agent ? (
          <StaffAvatar name={agent.full_name} url={agent.avatar_url} size="xs" />
        ) : (
          <span title="Unassigned" className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
