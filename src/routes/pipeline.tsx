import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  Plus,
  LayoutGrid,
  Rows3,
  ArrowUpRight,
  Users,
  ClipboardPlus,
  Lock,
  ChevronLeft,
  ChevronRight,
  Hourglass,
} from "lucide-react";
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
import { useLeads } from "@/hooks/use-leads";
import { usePendingReassignments } from "@/hooks/use-lead-reassignment";
import { useStageMoveFlow } from "@/components/stage-move-flow";
import { useTeamMembers } from "@/hooks/use-team";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { MaskedPhone } from "@/components/masked-phone";
import { TaskDrawer } from "@/components/task-drawer";
import { isClosedStage } from "@/lib/pipeline";
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
  // Mouse drags start after a few pixels (so a click still opens the lead and empty space can pan the board),
  // touch drags need a short press (so a swipe scrolls the board), and the keyboard can pick a card up too.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const { can } = usePermissions();
  const canMove = can("pipeline", "move");
  const canCreateLead = can("leads", "create");
  const canCreateTask = can("tasks", "create");
  const [taskLead, setTaskLead] = useState<Lead | null>(null);
  const { data: pendingHandovers = [] } = usePendingReassignments();
  const handoverByLead = useMemo(() => new Map(pendingHandovers.map((r) => [r.lead_id, r])), [pendingHandovers]);

  // Local optimistic copy of leads' stages
  const [localStage, setLocalStage] = useState<Record<string, string>>({});
  const merged = useMemo(
    () => leads.map((l) => ({ ...l, pipeline_stage: localStage[l.id] ?? l.pipeline_stage })),
    [leads, localStage],
  );

  // One flow for every move: forward-only for agents, corrections for a Super Administrator, the closing form
  // for Won, the negotiated-property question for Negotiation. The database judges each move again.
  const flow = useStageMoveFlow({
    optimistic: (id, stage) =>
      setLocalStage((m) => {
        if (stage) return { ...m, [id]: stage };
        const c = { ...m };
        delete c[id];
        return c;
      }),
  });

  async function onDragEnd(e: DragEndEvent) {
    if (!canMove || !e.over) return;
    const leadId = String(e.active.id);
    const targetStage = String(e.over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.pipeline_stage === targetStage) return;
    await flow.requestMove(lead, targetStage);
  }

  // Horizontal scrolling of the board: buttons, grab-to-pan on empty space, edge fades.
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, pipelineStages.length, view]);
  const scrollByColumns = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * 296 * 2, behavior: "smooth" });
  const pan = useRef<{ x: number; left: number } | null>(null);
  const [panning, setPanning] = useState(false);

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
          <div className="relative">
            {edges.left && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
                <button
                  type="button"
                  aria-label="Scroll the board left"
                  onClick={() => scrollByColumns(-1)}
                  className="absolute left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-canvas shadow-raised transition-colors hover:bg-muted sm:flex"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
            {edges.right && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
                <button
                  type="button"
                  aria-label="Scroll the board right"
                  onClick={() => scrollByColumns(1)}
                  className="absolute right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-canvas shadow-raised transition-colors hover:bg-muted sm:flex"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            <div
              ref={scroller}
              tabIndex={0}
              role="region"
              aria-label="Pipeline board. Use the left and right arrow keys, the scroll buttons, or drag empty space to move sideways."
              onScroll={updateEdges}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "ArrowRight") scrollByColumns(1);
                if (e.key === "ArrowLeft") scrollByColumns(-1);
              }}
              onPointerDown={(e) => {
                // Grab-to-pan only from empty space with a mouse, so cards and buttons keep their own behaviour.
                if (e.pointerType !== "mouse" || e.button !== 0) return;
                if ((e.target as HTMLElement).closest("[data-lead-card],button,a,input,select,textarea")) return;
                const el = scroller.current;
                if (!el) return;
                pan.current = { x: e.clientX, left: el.scrollLeft };
                setPanning(true);
                el.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!pan.current || !scroller.current) return;
                scroller.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
              }}
              onPointerUp={(e) => {
                if (!pan.current) return;
                pan.current = null;
                setPanning(false);
                scroller.current?.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                pan.current = null;
                setPanning(false);
              }}
              className={cn(
                "-mx-1 flex gap-3 overflow-x-auto scroll-smooth px-1 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                panning ? "cursor-grabbing select-none [scroll-behavior:auto]" : "cursor-default",
              )}
            >
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
                  superAdmin={flow.rights.superAdmin}
                  handoverByLead={handoverByLead}
                  onAddTask={canCreateTask ? setTaskLead : undefined}
                />
              );
            })}
            </div>
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
      {flow.host}
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
  superAdmin,
  handoverByLead,
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
  superAdmin: boolean;
  handoverByLead: Map<string, { to_agent_id: string; mode: string; deadline_at: string }>;
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
              // Closed (Won / Lost) leads are locked for everyone except a Super Administrator, who can correct them.
              draggable={droppable && (superAdmin || !isClosedStage(stages, l.pipeline_stage))}
              closed={isClosedStage(stages, l.pipeline_stage)}
              agent={team.find((t) => t.id === l.assigned_agent_id) ?? null}
              handover={
                handoverByLead.get(l.id)
                  ? (team.find((t) => t.id === handoverByLead.get(l.id)!.to_agent_id)?.full_name ?? "another agent")
                  : null
              }
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
  handover,
  onAddTask,
}: {
  lead: Lead;
  draggable: boolean;
  closed: boolean;
  agent: StaffLite | null;
  /** Name of the agent a pending handover is waiting on, when there is one. */
  handover: string | null;
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
      data-lead-card=""
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
      {handover && (
        <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-qbay-tint px-2 py-0.5 text-[10px] text-qbay">
          <Hourglass className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Handover pending: {handover}</span>
        </p>
      )}
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
