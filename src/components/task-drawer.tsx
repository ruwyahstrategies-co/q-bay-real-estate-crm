import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { LeadSearchSelect } from "./lead-picker";
import { PropertySearchSelect } from "./property-picker";
import { cn, titleCase } from "@/lib/utils";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useOwnerOptions } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { useCurrentUser } from "@/hooks/use-auth";
import { fromQatarInputValue, toQatarInputValue } from "@/lib/qatar-time";
import type { Task } from "@/lib/db";
import { PRIORITIES, TASK_STATUSES } from "@/lib/db";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

type Form = {
  title: string;
  description: string;
  task_type: string;
  dueLocal: string;
  priority: string;
  status: string;
  lead_id: string | null;
  property_id: string | null;
  owner_id: string | null;
  assigned_to: string | null;
};

export type TaskContext = {
  defaultLeadId?: string | null;
  defaultOwnerId?: string | null;
  defaultPropertyId?: string | null;
  /** Pre-filled title, for example "Follow up after viewing". */
  defaultTitle?: string;
  /** Who the task is for. When omitted, a new task is assigned to the person creating it. */
  defaultAssignedTo?: string | null;
  /** Pre-filled due date and time as a Qatar-time form value ("2026-10-20T09:00"), for example from a calendar day. */
  defaultDueLocal?: string;
  /** Where the task was created from (for example "interaction"), kept on the task. */
  source?: string;
  sourceRef?: string;
};

function initialForm(task: Task | null | undefined, ctx: TaskContext, meId: string | null): Form {
  return {
    title: task?.title ?? ctx.defaultTitle ?? "",
    description: task?.description ?? "",
    task_type: task?.task_type ?? "",
    dueLocal: task ? toQatarInputValue(task.due_at) : (ctx.defaultDueLocal ?? ""),
    priority: task?.priority ?? "medium",
    status: task?.status ?? "pending",
    lead_id: task?.lead_id ?? ctx.defaultLeadId ?? null,
    property_id: task?.property_id ?? ctx.defaultPropertyId ?? null,
    owner_id: task?.owner_id ?? ctx.defaultOwnerId ?? null,
    // A new task belongs to whoever creates it unless they deliberately pick someone else. Editing
    // never changes the assignee on its own.
    assigned_to: task ? task.assigned_to : (ctx.defaultAssignedTo ?? meId),
  };
}

/**
 * The one task form, used everywhere a task can be created or edited (lead, owner, property, viewing,
 * conversation, calendar). Context passed in (lead / owner / property) is pre-filled and linked back.
 */
export function TaskDrawer({
  open,
  onOpenChange,
  task,
  defaultLeadId,
  defaultOwnerId,
  defaultPropertyId,
  defaultTitle,
  defaultAssignedTo,
  defaultDueLocal,
  source,
  sourceRef,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
} & TaskContext) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const { data: owners = [] } = useOwnerOptions();
  const { data: team = [] } = useTeamMembers();
  const { teamMember: me } = useCurrentUser();
  const isEdit = !!task?.id;
  const ctx: TaskContext = { defaultLeadId, defaultOwnerId, defaultPropertyId, defaultTitle, defaultAssignedTo, defaultDueLocal };

  const [form, setForm] = useState<Form>(() => initialForm(task, ctx, me?.id ?? null));

  useEffect(() => {
    if (open) setForm(initialForm(task, ctx, me?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultLeadId, defaultOwnerId, defaultPropertyId, defaultTitle, defaultAssignedTo, defaultDueLocal, me?.id]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const title = form.title.trim();
    if (!title) return toast.error("Title is required");
    const dueAt = fromQatarInputValue(form.dueLocal);
    if (form.dueLocal && !dueAt) return toast.error("That due date is not valid");
    const payload = {
      title,
      description: form.description.trim() || null,
      task_type: form.task_type || null,
      due_at: dueAt,
      priority: form.priority || "medium",
      status: form.status || "pending",
      lead_id: form.lead_id || null,
      property_id: form.property_id || null,
      assigned_to: form.assigned_to || null,
      owner_id: form.owner_id || null,
    };
    try {
      if (isEdit && task) {
        await update.mutateAsync({ id: task.id, patch: payload });
        toast.success("Task updated");
      } else {
        await create.mutateAsync({
          ...payload,
          ...(source ? { source } : {}),
          ...(sourceRef ? { source_ref: sourceRef } : {}),
        });
        toast.success(
          form.assigned_to && form.assigned_to !== me?.id
            ? `Task created for ${team.find((m) => m.id === form.assigned_to)?.full_name ?? "the selected agent"}`
            : "Task created",
        );
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit task" : "Add task"}>
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Task" : "Add Task"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <Field label="Title *" full>
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="Due date and time (Qatar)">
          <input className={inputCls} type="datetime-local" value={form.dueLocal} onChange={(e) => set("dueLocal", e.target.value)} />
        </Field>
        <Field label="Priority">
          <SelectField
            value={form.priority}
            onChange={(v) => set("priority", v ?? "medium")}
            options={PRIORITIES.map((p) => ({ value: p, label: titleCase(p) }))}
            allowClear={false}
          />
        </Field>
        <Field label="Assigned to">
          <SearchableSelectField
            value={form.assigned_to}
            onChange={(v) => set("assigned_to", v)}
            options={team.filter((m) => m.is_active !== false || m.id === form.assigned_to).map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select team member"
            emptyLabel="Unassigned"
            searchPlaceholder="Search team..."
          />
        </Field>
        <Field label="Status">
          <SelectField
            value={form.status}
            onChange={(v) => set("status", v ?? "pending")}
            options={TASK_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
            allowClear={false}
          />
        </Field>
        <Field label="Lead">
          <LeadSearchSelect value={form.lead_id} onChange={(v) => set("lead_id", v)} />
        </Field>
        <Field label="Property">
          <PropertySearchSelect value={form.property_id} onChange={(v) => set("property_id", v)} allowClear placeholder="Search and select a property" />
        </Field>
        <Field label="Owner">
          <SearchableSelectField
            value={form.owner_id}
            onChange={(v) => set("owner_id", v)}
            options={owners.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Select owner"
            emptyLabel="- None -"
            searchPlaceholder="Search owners..."
          />
        </Field>
        {(form.lead_id || form.property_id || form.owner_id) && (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Open related record:</span>
            {form.lead_id && (
              <Link to="/leads/$leadId" params={{ leadId: form.lead_id }} className="inline-flex items-center gap-1 text-qbay hover:underline" onClick={() => onOpenChange(false)}>
                Lead <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {form.property_id && (
              <Link to="/properties/$propertyId" params={{ propertyId: form.property_id }} className="inline-flex items-center gap-1 text-qbay hover:underline" onClick={() => onOpenChange(false)}>
                Property <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {form.owner_id && (
              <Link to="/owners/$ownerId" params={{ ownerId: form.owner_id }} className="inline-flex items-center gap-1 text-qbay hover:underline" onClick={() => onOpenChange(false)}>
                Owner <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
        <Field label="Description" full>
          <textarea className={cn(inputCls, "h-24 py-2")} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-border bg-canvas/95 px-5 py-3 backdrop-blur">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
