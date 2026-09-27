import { useEffect, useState, type ReactNode } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { TenantDrawer } from "./tenant-drawers";
import {
  useCreateTenancy,
  useManagedProperties,
  useTenants,
  useUpdateTenancy,
} from "@/hooks/use-property-management";
import { LEASE_STATUSES, PAYMENT_FREQUENCIES, type PropertyLease } from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function Field({
  label,
  children,
  full,
  hint,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const CURRENCIES = ["QAR", "AED", "USD", "EUR", "GBP"];

/**
 * Create or edit a tenancy (the Rent Contract record). One tenancy has one contract reference,
 * one tenant and one property; the signed document is attached from the Rent Contract panel.
 */
export function TenancyDrawer({
  open,
  onOpenChange,
  lease,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When given, the drawer edits this tenancy instead of creating one. */
  lease?: PropertyLease | null;
}) {
  const isEdit = !!lease;
  const create = useCreateTenancy();
  const update = useUpdateTenancy();
  const { data: managed = [] } = useManagedProperties();
  const { data: tenants = [] } = useTenants();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [contractNumber, setContractNumber] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rent, setRent] = useState("");
  const [currency, setCurrency] = useState("QAR");
  const [deposit, setDeposit] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [addTenantOpen, setAddTenantOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPropertyId(lease?.property_id ?? null);
    setTenantId(lease?.tenant_id ?? null);
    setContractNumber(lease?.contract_number ?? "");
    setStart(lease?.lease_start ?? "");
    setEnd(lease?.lease_end ?? "");
    setRent(lease?.rent_amount != null ? String(lease.rent_amount) : "");
    setCurrency(lease?.currency ?? "QAR");
    setDeposit(lease?.deposit_amount != null ? String(lease.deposit_amount) : "");
    setFrequency(lease?.payment_frequency ?? "monthly");
    setStatus(lease?.status ?? "active");
    setNotes(lease?.notes ?? "");
  }, [open, lease]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) return toast.error("Select a managed property");
    if (start && end && end < start) return toast.error("The end date is before the start date");
    const reference = contractNumber.trim();
    try {
      if (lease) {
        await update.mutateAsync({
          id: lease.id,
          patch: {
            tenant_id: tenantId,
            // The reference is never blanked: an empty box keeps the current one.
            ...(reference ? { contract_number: reference } : {}),
            lease_start: start || null,
            lease_end: end || null,
            rent_amount: rent ? Number(rent) : null,
            currency,
            deposit_amount: deposit ? Number(deposit) : null,
            payment_frequency: frequency,
            status,
            notes: notes.trim() || null,
          },
        });
        toast.success("Tenancy updated");
      } else {
        await create.mutateAsync({
          property_id: propertyId,
          tenant_id: tenantId,
          // Left empty, the database issues the next reference (RC-YYYY-NNNN).
          ...(reference ? { contract_number: reference } : {}),
          lease_start: start || null,
          lease_end: end || null,
          rent_amount: rent ? Number(rent) : null,
          currency,
          deposit_amount: deposit ? Number(deposit) : null,
          payment_frequency: frequency,
          status,
          notes: notes.trim() || null,
        });
        toast.success(
          "Tenancy created. Upload the signed Rent Contract from the Rent Contract button.",
        );
      }
      onOpenChange(false);
    } catch (err) {
      const message = (err as Error).message;
      toast.error(
        /property_leases_contract_number_uniq|duplicate key/i.test(message)
          ? "Another tenancy already uses that contract reference"
          : message,
      );
    }
  }

  return (
    <>
      <DrawerShell
        open={open}
        onOpenChange={onOpenChange}
        ariaLabel={isEdit ? "Edit tenancy" : "Add tenancy"}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{isEdit ? "Edit Tenancy" : "Add Tenancy"}</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start"
          onSubmit={handleSubmit}
        >
          <Field
            label="Contract reference"
            full
            hint={isEdit ? undefined : "Leave empty to generate one automatically."}
          >
            <input
              className={inputCls}
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              placeholder="RC-2026-0001"
            />
          </Field>
          <Field label="Managed property *" full>
            <SearchableSelectField
              value={propertyId}
              onChange={setPropertyId}
              options={managed.map((p) => ({ value: p.id, label: p.title }))}
              placeholder="Select property"
              searchPlaceholder="Search..."
              disabled={isEdit}
            />
          </Field>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tenant
            </span>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelectField
                  value={tenantId}
                  onChange={setTenantId}
                  options={tenants.map((t) => ({
                    value: t.id,
                    label: `${t.full_name} · ${t.phone ?? "no phone"}`,
                  }))}
                  placeholder="Select tenant"
                  searchPlaceholder="Search by name..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddTenantOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5" /> New tenant
              </Button>
            </div>
          </div>
          <Field label="Start date">
            <input
              className={inputCls}
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="End date">
            <input
              className={inputCls}
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Rent amount">
            <input
              className={inputCls}
              type="number"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <SelectField
              value={currency}
              onChange={(v) => setCurrency(v ?? "QAR")}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              allowClear={false}
            />
          </Field>
          <Field label="Deposit">
            <input
              className={inputCls}
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
          <Field label="Payment frequency">
            <SelectField
              value={frequency}
              onChange={(v) => setFrequency(v ?? "monthly")}
              options={PAYMENT_FREQUENCIES.map((f) => ({ value: f, label: titleCase(f) }))}
              allowClear={false}
            />
          </Field>
          <Field label="Status">
            <SelectField
              value={status}
              onChange={(v) => setStatus(v ?? "active")}
              options={LEASE_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
              allowClear={false}
            />
          </Field>
          <Field label="Notes" full>
            <textarea
              className={cn(inputCls, "h-20 py-2")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth knowing about this contract"
            />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DrawerShell>
      <TenantDrawer
        open={addTenantOpen}
        onOpenChange={setAddTenantOpen}
        onCreated={(t) => setTenantId(t.id)}
      />
    </>
  );
}
