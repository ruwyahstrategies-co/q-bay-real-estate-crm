import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
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

function initialForm(task: Task | null | undefined, defaultLeadId: string | null | undefined): Partial<Task> {
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
  };
}

export function TaskDrawer({
  open,
  onOpenChange,
  task,
  defaultLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  defaultLeadId?: string | null;
}) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: team = [] } = useTeamMembers();
  const isEdit = !!task?.id;

  const [form, setForm] = useState<Partial<Task>>(() => initialForm(task, defaultLeadId));

  useEffect(() => {
    if (open) setForm(initialForm(task, defaultLeadId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultLeadId]);

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
          <select className={inputCls} value={form.priority ?? "medium"} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Assigned to">
          <select className={inputCls} value={form.assigned_to ?? ""} onChange={(e) => set("assigned_to", e.target.value || null)}>
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Lead">
          <select className={inputCls} value={form.lead_id ?? ""} onChange={(e) => set("lead_id", e.target.value || null)}>
            <option value="">- None -</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>{l.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Property">
          <select className={inputCls} value={form.property_id ?? ""} onChange={(e) => set("property_id", e.target.value || null)}>
            <option value="">- None -</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status ?? "pending"} onChange={(e) => set("status", e.target.value)}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
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
