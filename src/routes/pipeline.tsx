import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, LayoutGrid, Rows3 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useLeads, useChangePipelineStage } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { fmtMoney, type Lead } from "@/lib/db";
import { APP_CONFIG } from "@/lib/config";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: `Pipeline — ${APP_CONFIG.productName}` }] }),
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

  // Local optimistic copy of leads' stages
  const [localStage, setLocalStage] = useState<Record<string, string>>({});
  const merged = useMemo(
    () => leads.map((l) => ({ ...l, pipeline_stage: localStage[l.id] ?? l.pipeline_stage })),
    [leads, localStage],
  );

  async function onDragEnd(e: DragEndEvent) {
    if (!canMove || !e.over) return;
    const leadId = String(e.active.id);
    const targetStage = String(e.over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.pipeline_stage === targetStage) return;
    const prev = lead.pipeline_stage;
    setLocalStage((m) => ({ ...m, [leadId]: targetStage }));
    try {
      await changeStage.mutateAsync({ id: leadId, newStage: targetStage, previousStage: prev });
      toast.success("Stage updated");
    } catch (err) {
      setLocalStage((m) => {
        const c = { ...m };
        delete c[leadId];
        return c;
      });
      toast.error((err as Error).message);
    }
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

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2">
        <input
          type="text"
          placeholder="Search leads in pipeline…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 flex-1 min-w-[200px] rounded-lg bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select value={agent ?? ""} onChange={(e) => setAgent(e.target.value || null)} className="h-9 rounded-lg border border-border bg-canvas px-3 text-xs">
          <option value="">All agents</option>
          {team.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "board" && "bg-canvas")} onClick={() => setView("board")} aria-label="Board view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "list" && "bg-canvas")} onClick={() => setView("list")} aria-label="List view">
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-3">
            {pipelineStages.map((stage) => {
              const items = merged.filter((l) => l.pipeline_stage === stage.stage_key);
              const total = items.reduce((acc, l) => acc + (l.budget_max ?? 0), 0);
              return <StageColumn key={stage.id} stageKey={stage.stage_key} label={stage.name} items={items} total={total} droppable={canMove} />;
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
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm">{l.full_name}</td>
                  <td className="px-4 py-3 text-xs">{pipelineStages.find((s) => s.stage_key === l.pipeline_stage)?.name ?? l.pipeline_stage.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs">{fmtMoney(l.budget_max, l.currency)}</td>
                  <td className="px-4 py-3 text-xs">{team.find((t) => t.id === l.assigned_agent_id)?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.updated_at).toLocaleDateString()}</td>
                </tr>
              ))
            : null}
        </DataTable>
      )}

      <AddLeadDrawer open={addOpen} onOpenChange={setAddOpen} />
      </PermissionGate>
    </AppShell>
  );
}

function StageColumn({ stageKey, label, items, total, droppable }: { stageKey: string; label: string; items: Lead[]; total: number; droppable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[260px] flex-shrink-0 flex-col rounded-xl border bg-background p-3 transition-colors",
        isOver ? "border-foreground bg-muted" : "border-border",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex-1 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-canvas px-3 py-6 text-center text-[11px] text-muted-foreground">
            No leads in this stage
          </div>
        ) : items.map((l) => <DraggableCard key={l.id} lead={l} draggable={droppable} />)}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Total value: {total > 0 ? fmtMoney(total, items[0]?.currency) : "—"}</p>
    </div>
  );
}

function DraggableCard({ lead, draggable }: { lead: Lead; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, disabled: !draggable });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(draggable ? listeners : {})}
      className={cn(
        "rounded-lg border border-border bg-canvas p-3 shadow-sm hover:shadow",
        draggable ? "cursor-grab" : "cursor-default",
        isDragging && "opacity-50",
      )}
    >
      <p className="text-sm font-medium">{lead.full_name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{lead.phone ?? lead.email ?? ""}</p>
      <p className="mt-2 text-xs">{fmtMoney(lead.budget_max, lead.currency)}</p>
    </div>
  );
}
