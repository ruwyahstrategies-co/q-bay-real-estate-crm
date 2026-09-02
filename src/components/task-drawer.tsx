import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { cn, titleCase } from "@/lib/utils";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { useOwners } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import type { Task } from "@/lib/db";
import { PRIORITIES, TASK_STATUSES } from "@/lib/db";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function initialForm(task: Task | null | undefined, defaultLeadId: string | null | undefined, defaultOwnerId: string | null | undefined): Partial<Task> {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    task_type: task?.task_type ?? "",
    due_at: task?.due_at ?? null,
    priority: task?.priority ?? "medium",
    status: task?.status ?? "pending",
    lead_id: task?.lead_id ?? defaultLeadId ?? null,
    property_id: task?.property_id ?? null,
    assigned_to: task?.assigned_to ?? null,
    owner_id: task?.owner_id ?? defaultOwnerId ?? null,
  };
}

export function TaskDrawer({
  open,
  onOpenChange,
  task,
  defaultLeadId,
  defaultOwnerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaultLeadId?: string | null;
  defaultOwnerId?: string | null;
}) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: owners = [] } = useOwners();
  const { data: team = [] } = useTeamMembers();
  const isEdit = !!task?.id;

  const [form, setForm] = useState<Partial<Task>>(() => initialForm(task, defaultLeadId, defaultOwnerId));

  useEffect(() => {
    if (open) setForm(initialForm(task, defaultLeadId, defaultOwnerId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultLeadId, defaultOwnerId]);

  function set<K extends keyof Task>(k: K, v: Task[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const title = (form.title ?? "").trim();
    if (!title) return toast.error("Title is required");
    const payload = {
      title,
      description: form.description || null,
      task_type: form.task_type || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
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
        await create.mutateAsync(payload);
        toast.success("Task created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const dueValue = form.due_at ? new Date(form.due_at).toISOString().slice(0, 16) : "";

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit task" : "Add task"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Task" : "Add Task"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <Field label="Title *" full>
          <input className={inputCls} value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="Due date">
          <input className={inputCls} type="datetime-local" value={dueValue} onChange={(e) => set("due_at", e.target.value || null)} />
        </Field>
        <Field label="Priority">
          <SelectField
            value={form.priority ?? "medium"}
            onChange={(v) => set("priority", (v ?? "medium") as Task["priority"])}
            options={PRIORITIES.map((p) => ({ value: p, label: titleCase(p) }))}
            allowClear={false}
          />
        </Field>
        <Field label="Assigned to">
          <SearchableSelectField
            value={form.assigned_to}
            onChange={(v) => set("assigned_to", v)}
            options={team.map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select team member"
            emptyLabel="Unassigned"
            searchPlaceholder="Search team..."
          />
        </Field>
        <Field label="Lead">
          <SearchableSelectField
            value={form.lead_id}
            onChange={(v) => set("lead_id", v)}
            options={leads.map((l) => ({ value: l.id, label: l.full_name }))}
            placeholder="Select lead"
            emptyLabel="- None -"
            searchPlaceholder="Search leads..."
          />
        </Field>
        <Field label="Property">
          <SearchableSelectField
            value={form.property_id}
            onChange={(v) => set("property_id", v)}
            options={properties.map((p) => ({ value: p.id, label: p.title }))}
            placeholder="Select property"
            emptyLabel="- None -"
            searchPlaceholder="Search properties..."
          />
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
        <Field label="Status">
          <SelectField
            value={form.status ?? "pending"}
            onChange={(v) => set("status", (v ?? "pending") as Task["status"])}
            options={TASK_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
            allowClear={false}
          />
        </Field>
        <Field label="Description" full>
          <textarea className={cn(inputCls, "h-24 py-2")} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
