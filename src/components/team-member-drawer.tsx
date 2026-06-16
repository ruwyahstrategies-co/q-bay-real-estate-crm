import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import { useCreateTeamMember, useUpdateTeamMember } from "@/hooks/use-team";
import type { TeamMember } from "@/lib/db";

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

export function TeamMemberDrawer({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member?: TeamMember | null;
}) {
  const create = useCreateTeamMember();
  const update = useUpdateTeamMember();
  const isEdit = !!member?.id;

  const [form, setForm] = useState<Partial<TeamMember>>(() => ({
    full_name: member?.full_name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: member?.role ?? "agent",
    is_active: member?.is_active ?? true,
    notes: member?.notes ?? "",
  }));

  if (!open) return null;

  function set<K extends keyof TeamMember>(k: K, v: TeamMember[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = (form.full_name ?? "").trim();
    if (!name) return toast.error("Full name is required");
    const payload = {
      full_name: name,
      email: form.email || null,
      phone: form.phone || null,
      role: form.role || null,
      is_active: form.is_active ?? true,
      notes: form.notes || null,
    };
    try {
      if (isEdit && member) {
        await update.mutateAsync({ id: member.id, patch: payload });
        toast.success("Team member updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Team member added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30">
      <div className="flex w-full max-w-md flex-col bg-canvas shadow-2xl" role="dialog">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{isEdit ? "Edit Member" : "Add Team Member"}</h3>
          <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Full name *" full>
            <input className={inputCls} value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} required />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Role">
            <select className={inputCls} value={form.role ?? ""} onChange={(e) => set("role", e.target.value)}>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="agent">Agent</option>
              <option value="coordinator">Coordinator</option>
              <option value="viewer">Viewer</option>
            </select>
          </Field>
          <Field label="Active">
            <select className={inputCls} value={form.is_active ? "yes" : "no"} onChange={(e) => set("is_active", e.target.value === "yes")}>
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea className={cn(inputCls, "h-24 py-2")} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
