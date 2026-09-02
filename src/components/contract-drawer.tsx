import { useEffect, useState } from "react";
import { X, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { cn } from "@/lib/utils";
import { useCreateOwnerContract, useUpdateOwnerContract, useContractTemplates } from "@/hooks/use-owner-contracts";
import { useOwnerProperties } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { fillContractTemplate, openContractPdf, contractTitle } from "@/lib/contract-pdf";
import { CONTRACT_PURPOSES, type Owner, type OwnerContract } from "@/lib/db";

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

function initialForm(contract: OwnerContract | null | undefined): Partial<OwnerContract> {
  return {
    property_id: contract?.property_id ?? null,
    template_id: contract?.template_id ?? null,
    purpose: contract?.purpose ?? "rent",
    commission_rate: contract?.commission_rate ?? null,
    commission_amount: contract?.commission_amount ?? null,
    amount: contract?.amount ?? null,
    currency: contract?.currency ?? "QAR",
    start_date: contract?.start_date ?? null,
    end_date: contract?.end_date ?? null,
    expiry_date: contract?.expiry_date ?? null,
    terms: contract?.terms ?? "",
    assigned_agent_id: contract?.assigned_agent_id ?? null,
    status: contract?.status ?? "draft",
  };
}

export function ContractDrawer({
  open,
  onOpenChange,
  owner,
  contract,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  owner: Owner;
  contract?: OwnerContract | null;
}) {
  const create = useCreateOwnerContract();
  const update = useUpdateOwnerContract();
  const { data: templates = [] } = useContractTemplates();
  const { data: properties = [] } = useOwnerProperties(owner.id);
  const { data: team = [] } = useTeamMembers();
  const isEdit = !!contract?.id;

  const [form, setForm] = useState<Partial<OwnerContract>>(() => initialForm(contract));

  useEffect(() => {
    if (open) setForm(initialForm(contract));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  function set<K extends keyof OwnerContract>(k: K, v: OwnerContract[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const pending = create.isPending || update.isPending;
  const selectedTemplate = templates.find((t) => t.id === form.template_id) ?? templates.find((t) => t.purpose === form.purpose && t.is_default) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const payload = {
      owner_id: owner.id,
      property_id: form.property_id || null,
      template_id: form.template_id || selectedTemplate?.id || null,
      purpose: form.purpose || "rent",
      commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
      commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
      amount: form.amount ? Number(form.amount) : null,
      currency: form.currency || "QAR",
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      expiry_date: form.expiry_date || null,
      terms: form.terms || null,
      assigned_agent_id: form.assigned_agent_id || null,
      status: form.status || "draft",
    };
    try {
      if (isEdit && contract) {
        await update.mutateAsync({ id: contract.id, patch: payload });
        toast.success("Contract updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Contract created as draft");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleGenerate() {
    if (!selectedTemplate) {
      toast.error("No template available for this purpose yet.");
      return;
    }
    const property = properties.find((p) => p.id === form.property_id) ?? null;
    const filled = fillContractTemplate(selectedTemplate.body_html, { owner, property: property as any, contract: form });
    try {
      if (isEdit && contract) {
        await update.mutateAsync({
          id: contract.id,
          patch: { status: "generated", generated_html: filled, generated_at: new Date().toISOString(), template_id: selectedTemplate.id },
        });
      } else {
        const saved = await create.mutateAsync({
          owner_id: owner.id,
          property_id: form.property_id || null,
          template_id: selectedTemplate.id,
          purpose: form.purpose || "rent",
          commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
          commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
          amount: form.amount ? Number(form.amount) : null,
          currency: form.currency || "QAR",
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          expiry_date: form.expiry_date || null,
          terms: form.terms || null,
          assigned_agent_id: form.assigned_agent_id || null,
          status: "generated",
          generated_html: filled,
          generated_at: new Date().toISOString(),
        });
        void saved;
      }
      openContractPdf(filled, contractTitle(selectedTemplate, owner, property as any));
      toast.success("Contract generated");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit contract" : "Generate contract"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Contract" : "Generate Contract"} - {owner.name}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <Field label="Property / listing">
          <SearchableSelectField
            value={form.property_id}
            onChange={(v) => set("property_id", v)}
            options={properties.map((p) => ({ value: p.id, label: `${p.reference_code ? p.reference_code + " · " : ""}${p.title}` }))}
            placeholder="Select property"
            emptyLabel="None"
            searchPlaceholder="Search properties..."
          />
        </Field>
        <Field label="Purpose">
          <SelectField
            value={form.purpose ?? "rent"}
            onChange={(v) => set("purpose", (v ?? "rent") as OwnerContract["purpose"])}
            options={CONTRACT_PURPOSES.map((p) => ({ value: p, label: p === "rent" ? "Rent" : p === "sale" ? "Sale" : "Other" }))}
            allowClear={false}
          />
        </Field>
        <Field label="Template" full>
          <SelectField
            value={form.template_id ?? selectedTemplate?.id ?? null}
            onChange={(v) => set("template_id", v)}
            options={templates.filter((t) => t.purpose === form.purpose).map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Use default for this purpose"
          />
        </Field>
        <Field label="Amount">
          <input className={inputCls} type="number" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Currency">
          <SelectField value={form.currency ?? "QAR"} onChange={(v) => set("currency", v ?? "QAR")} options={["QAR", "AED", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))} allowClear={false} />
        </Field>
        <Field label="Commission rate (%)">
          <input className={inputCls} type="number" step="0.1" value={form.commission_rate ?? ""} onChange={(e) => set("commission_rate", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Commission amount">
          <input className={inputCls} type="number" value={form.commission_amount ?? ""} onChange={(e) => set("commission_amount", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Start date">
          <input className={inputCls} type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} />
        </Field>
        <Field label="End date">
          <input className={inputCls} type="date" value={form.end_date ?? ""} onChange={(e) => set("end_date", e.target.value || null)} />
        </Field>
        <Field label="Expiry date (for renewal reminders)">
          <input className={inputCls} type="date" value={form.expiry_date ?? ""} onChange={(e) => set("expiry_date", e.target.value || null)} />
        </Field>
        <Field label="Assigned agent">
          <SearchableSelectField value={form.assigned_agent_id} onChange={(v) => set("assigned_agent_id", v)} options={team.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Select agent" searchPlaceholder="Search agents..." />
        </Field>
        <Field label="Status">
          <SelectField
            value={form.status ?? "draft"}
            onChange={(v) => set("status", (v ?? "draft") as OwnerContract["status"])}
            options={["draft", "generated", "signed", "expired", "cancelled"].map((s) => ({ value: s, label: s }))}
            allowClear={false}
          />
        </Field>
        <Field label="Terms / notes" full>
          <textarea className={cn(inputCls, "h-24 py-2")} value={form.terms ?? ""} onChange={(e) => set("terms", e.target.value)} />
        </Field>

        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleGenerate}>
            <FileDown className="h-3.5 w-3.5" /> Save & Generate PDF
          </Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : isEdit ? "Save changes" : "Save as draft"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
