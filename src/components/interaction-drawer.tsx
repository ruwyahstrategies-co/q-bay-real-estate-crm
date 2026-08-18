import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import { useCreateInteraction, useUpdateInteraction } from "@/hooks/use-interactions";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import type { Interaction } from "@/lib/db";
import { INTERACTION_TYPES, DIRECTIONS } from "@/lib/db";

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

function initialForm(interaction: Interaction | null | undefined, defaultLeadId: string | null | undefined): Partial<Interaction> {
  return {
    interaction_type: interaction?.interaction_type ?? "manual_note",
    direction: interaction?.direction ?? "inbound",
    subject: interaction?.subject ?? "",
    content: interaction?.content ?? "",
    interaction_date: interaction?.interaction_date ?? new Date().toISOString().slice(0, 16),
    duration_seconds: interaction?.duration_seconds ?? null,
    lead_id: interaction?.lead_id ?? defaultLeadId ?? null,
    property_id: interaction?.property_id ?? null,
  };
}

export function InteractionDrawer({
  open,
  onOpenChange,
  interaction,
  defaultLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interaction?: Interaction | null;
  defaultLeadId?: string | null;
}) {
  const create = useCreateInteraction();
  const update = useUpdateInteraction();
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const isEdit = !!interaction?.id;

  const [form, setForm] = useState<Partial<Interaction>>(() => initialForm(interaction, defaultLeadId));

  useEffect(() => {
    if (open) setForm(initialForm(interaction, defaultLeadId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interaction?.id, defaultLeadId]);

  function set<K extends keyof Interaction>(k: K, v: Interaction[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!form.interaction_type) {
      toast.error("Interaction type is required");
      return;
    }
    const payload = {
      interaction_type: form.interaction_type,
      direction: form.direction || null,
      subject: form.subject || null,
      content: form.content || null,
      interaction_date: form.interaction_date ? new Date(form.interaction_date).toISOString() : new Date().toISOString(),
      duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : null,
      lead_id: form.lead_id || null,
      property_id: form.property_id || null,
    };
    try {
      if (isEdit && interaction) {
        await update.mutateAsync({ id: interaction.id, patch: payload });
        toast.success("Interaction updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Interaction logged");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const dateValue = form.interaction_date ? new Date(form.interaction_date).toISOString().slice(0, 16) : "";

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit interaction" : "Add interaction"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Interaction" : "Add Interaction"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <Field label="Type *">
          <select className={inputCls} value={form.interaction_type ?? ""} onChange={(e) => set("interaction_type", e.target.value)}>
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>
        <Field label="Direction">
          <select className={inputCls} value={form.direction ?? ""} onChange={(e) => set("direction", e.target.value)}>
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Lead">
          <select className={inputCls} value={form.lead_id ?? ""} onChange={(e) => set("lead_id", e.target.value || null)}>
            <option value="">--- None ---</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>{l.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Property (optional)">
          <select className={inputCls} value={form.property_id ?? ""} onChange={(e) => set("property_id", e.target.value || null)}>
            <option value="">--- None ---</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Date & time">
          <input className={inputCls} type="datetime-local" value={dateValue} onChange={(e) => set("interaction_date", e.target.value)} />
        </Field>
        <Field label="Duration (seconds)">
          <input className={inputCls} type="number" value={form.duration_seconds ?? ""} onChange={(e) => set("duration_seconds", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Subject" full>
          <input className={inputCls} value={form.subject ?? ""} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field label="Content / notes" full>
          <textarea className={cn(inputCls, "h-28 py-2")} value={form.content ?? ""} onChange={(e) => set("content", e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving--¦" : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
