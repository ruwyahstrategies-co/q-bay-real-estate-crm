import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import { useCreateLead, useUpdateLead } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import type { Lead } from "@/lib/db";
import { PIPELINE_STAGES } from "@/lib/db";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type FormState = Partial<Lead> & { preferred_locations_str?: string };

function toCsv(arr: string[] | null | undefined): string {
  return (arr ?? []).join(", ");
}

function fromCsv(s: string): string[] | null {
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

export function AddLeadDrawer({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: Lead | null;
}) {
  const create = useCreateLead();
  const update = useUpdateLead();
  const { data: team = [] } = useTeamMembers();
  const isEdit = !!lead?.id;

  const [form, setForm] = useState<FormState>(() => ({
    full_name: lead?.full_name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    nationality: lead?.nationality ?? "",
    preferred_language: lead?.preferred_language ?? "",
    budget_min: lead?.budget_min ?? null,
    budget_max: lead?.budget_max ?? null,
    currency: lead?.currency ?? "QAR",
    preferred_locations_str: toCsv(lead?.preferred_locations),
    preferred_property_types: lead?.preferred_property_types ?? null,
    purchase_purpose: lead?.purchase_purpose ?? "",
    buying_timeline: lead?.buying_timeline ?? "",
    financing_status: lead?.financing_status ?? "",
    lead_source: lead?.lead_source ?? "",
    pipeline_stage: lead?.pipeline_stage ?? "new_lead",
    assigned_agent_id: lead?.assigned_agent_id ?? null,
    notes: lead?.notes ?? "",
  }));

  if (!open) return null;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = (form.full_name ?? "").trim();
    if (!name) {
      toast.error("Full name is required");
      return;
    }
    const payload = {
      full_name: name,
      phone: form.phone || null,
      email: form.email || null,
      nationality: form.nationality || null,
      preferred_language: form.preferred_language || null,
      budget_min: form.budget_min != null && form.budget_min !== ("" as unknown as number) ? Number(form.budget_min) : null,
      budget_max: form.budget_max != null && form.budget_max !== ("" as unknown as number) ? Number(form.budget_max) : null,
      currency: form.currency || "QAR",
      preferred_locations: fromCsv(form.preferred_locations_str ?? ""),
      preferred_property_types: form.preferred_property_types ?? null,
      purchase_purpose: form.purchase_purpose || null,
      buying_timeline: form.buying_timeline || null,
      financing_status: form.financing_status || null,
      lead_source: form.lead_source || null,
      pipeline_stage: form.pipeline_stage || "new_lead",
      assigned_agent_id: form.assigned_agent_id || null,
      notes: form.notes || null,
    };
    try {
      if (isEdit && lead) {
        await update.mutateAsync({ id: lead.id, patch: payload });
        toast.success("Lead updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Lead created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30">
      <div className="flex w-full max-w-md flex-col bg-canvas shadow-2xl" role="dialog" aria-label={isEdit ? "Edit lead" : "Add lead"}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{isEdit ? "Edit Lead" : "Add Lead"}</h3>
          <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Full name *" full>
            <input className={inputCls} placeholder="Jane Doe" value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} required />
          </Field>
          <Field label="Phone number">
            <input className={inputCls} placeholder="+974…" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" placeholder="jane@…" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Nationality">
            <input className={inputCls} value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <Field label="Preferred language">
            <input className={inputCls} placeholder="English" value={form.preferred_language ?? ""} onChange={(e) => set("preferred_language", e.target.value)} />
          </Field>
          <Field label="Budget min">
            <input className={inputCls} type="number" value={form.budget_min ?? ""} onChange={(e) => set("budget_min", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Budget max">
            <input className={inputCls} type="number" value={form.budget_max ?? ""} onChange={(e) => set("budget_max", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={form.currency ?? "QAR"} onChange={(e) => set("currency", e.target.value)}>
              <option>QAR</option>
              <option>AED</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </Field>
          <Field label="Preferred locations (comma separated)" full>
            <input className={inputCls} value={form.preferred_locations_str ?? ""} onChange={(e) => set("preferred_locations_str", e.target.value)} />
          </Field>
          <Field label="Purchase purpose">
            <select className={inputCls} value={form.purchase_purpose ?? ""} onChange={(e) => set("purchase_purpose", e.target.value)}>
              <option value="">—</option>
              <option>Primary residence</option>
              <option>Investment</option>
              <option>Holiday home</option>
            </select>
          </Field>
          <Field label="Buying timeline">
            <select className={inputCls} value={form.buying_timeline ?? ""} onChange={(e) => set("buying_timeline", e.target.value)}>
              <option value="">—</option>
              <option>Immediate</option>
              <option>1-3 months</option>
              <option>3-6 months</option>
              <option>6-12 months</option>
              <option>Exploring</option>
            </select>
          </Field>
          <Field label="Financing status">
            <select className={inputCls} value={form.financing_status ?? ""} onChange={(e) => set("financing_status", e.target.value)}>
              <option value="">—</option>
              <option>Cash</option>
              <option>Mortgage approved</option>
              <option>Mortgage pending</option>
              <option>Undecided</option>
            </select>
          </Field>
          <Field label="Lead source">
            <input className={inputCls} placeholder="Website, referral…" value={form.lead_source ?? ""} onChange={(e) => set("lead_source", e.target.value)} />
          </Field>
          <Field label="Pipeline stage">
            <select className={inputCls} value={form.pipeline_stage ?? "new_lead"} onChange={(e) => set("pipeline_stage", e.target.value)}>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned agent">
            <select className={inputCls} value={form.assigned_agent_id ?? ""} onChange={(e) => set("assigned_agent_id", e.target.value || null)}>
              <option value="">Unassigned</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea className={cn(inputCls, "h-24 py-2")} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Save Lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
