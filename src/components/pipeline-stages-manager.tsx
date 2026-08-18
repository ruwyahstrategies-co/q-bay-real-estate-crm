import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Check, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import {
  usePipelineStages,
  useCreateStage,
  useUpdateStage,
  useReorderStages,
  useDeleteStage,
} from "@/hooks/use-pipeline-stages";
import type { PipelineStageRow } from "@/lib/db";

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "stage"
  );
}

export function PipelineStagesManager() {
  const { data: stages = [], isLoading } = usePipelineStages();
  const create = useCreateStage();
  const update = useUpdateStage();
  const reorder = useReorderStages();
  const del = useDeleteStage();
  const [newName, setNewName] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === e.active.id);
    const newIndex = stages.findIndex((s) => s.id === e.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(stages, oldIndex, newIndex);
    try {
      await reorder.mutateAsync(next.map((s, i) => ({ id: s.id, position: i })));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const existingKeys = new Set(stages.map((s) => s.stage_key));
    let key = slugify(name);
    let i = 2;
    while (existingKeys.has(key)) key = `${slugify(name)}_${i++}`;
    try {
      await create.mutateAsync({
        stage_key: key,
        name,
        position: stages.length,
        is_active: true,
        is_won: false,
        is_lost: false,
      });
      setNewName("");
      toast.success("Stage added");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading stages--¦</p>;

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Drag to reorder. Renaming only changes the display label --- the pipeline board and lead forms
        update automatically.
      </p>
      <div className="mt-4 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {stages.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                onRename={(name) => update.mutate({ id: stage.id, patch: { name } })}
                onToggleActive={() =>
                  update.mutate({ id: stage.id, patch: { is_active: !stage.is_active } })
                }
                onToggleWon={() =>
                  update.mutate({
                    id: stage.id,
                    patch: { is_won: !stage.is_won, is_lost: stage.is_won ? stage.is_lost : false },
                  })
                }
                onToggleLost={() =>
                  update.mutate({
                    id: stage.id,
                    patch: {
                      is_lost: !stage.is_lost,
                      is_won: stage.is_lost ? stage.is_won : false,
                    },
                  })
                }
                onDelete={async () => {
                  try {
                    await del.mutateAsync(stage);
                    toast.success("Stage deleted");
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stage name--¦"
          className="h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" size="sm" onClick={handleAdd} disabled={create.isPending}>
          <Plus className="h-3.5 w-3.5" /> Add stage
        </Button>
      </div>
    </div>
  );
}

function StageRow({
  stage,
  onRename,
  onToggleActive,
  onToggleWon,
  onToggleLost,
  onDelete,
}: {
  stage: PipelineStageRow;
  onRename: (name: string) => void;
  onToggleActive: () => void;
  onToggleWon: () => void;
  onToggleLost: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2",
        isDragging && "opacity-60",
        !stage.is_active && "opacity-50",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab p-1 text-muted-foreground"
        aria-label="Reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (name.trim() && name.trim() !== stage.name) onRename(name.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(stage.name);
              setEditing(false);
            }
          }}
          className="h-8 flex-1 rounded-md border border-border bg-canvas px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          className="flex-1 truncate text-left text-sm hover:underline"
          onClick={() => setEditing(true)}
        >
          {stage.name} <span className="text-xs text-muted-foreground">({stage.stage_key})</span>
        </button>
      )}

      <button
        onClick={onToggleWon}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
          stage.is_won ? "bg-pastel-green" : "bg-muted text-muted-foreground",
        )}
        title="Mark as Won"
      >
        <Trophy className="h-3 w-3" /> Won
      </button>
      <button
        onClick={onToggleLost}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
          stage.is_lost ? "bg-[#FADCDA]" : "bg-muted text-muted-foreground",
        )}
        title="Mark as Lost"
      >
        <XCircle className="h-3 w-3" /> Lost
      </button>
      <button
        onClick={onToggleActive}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
          stage.is_active ? "bg-pastel-blue" : "bg-muted text-muted-foreground",
        )}
        title={stage.is_active ? "Disable stage" : "Enable stage"}
      >
        <Check className="h-3 w-3" /> {stage.is_active ? "Active" : "Disabled"}
      </button>
      <button
        onClick={onDelete}
        className="rounded-md p-1.5 text-destructive hover:bg-muted"
        aria-label="Delete stage"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
