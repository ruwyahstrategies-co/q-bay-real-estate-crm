import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField } from "./select-field";
import { PropertySearchSelect } from "./property-picker";
import { cn } from "@/lib/utils";
import { fmtMoney, sb } from "@/lib/db";
import { qatarDayKey } from "@/lib/qatar-time";
import {
  CLOSING_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUS_OPTIONS,
  closingDefaults,
  closingTypeFor,
  commissionFor,
  toNumber,
  validateClosing,
  type ClosingType,
  type ClosingValues,
} from "@/lib/closing";
import { useCloseLeadDeal } from "@/hooks/use-closing";
import { useLeadOffers } from "@/hooks/use-offers";
import { useLeadReferences } from "@/hooks/use-references";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function Field({
  label,
  error,
  hint,
  children,
  full,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export type ClosingLead = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  transaction_intent: string | null;
};

type PropertyFacts = {
  id: string;
  title: string;
  price: number | null;
  currency: string | null;
  purpose: string | null;
  availability: string | null;
};

function usePropertyFacts(id: string | null | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["properties", "closing-facts", id ?? "none"],
    queryFn: async (): Promise<PropertyFacts | null> => {
      const { data, error } = await sb
        .from("properties")
        .select("id, title, price, currency, purpose, availability")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Records a Won / Sold / Rented deal in one step: the actual date, client, property, price, payment method and
 * status, and commission. The database then updates the transaction, the property's availability, the lead's
 * stage, the interest and the history together, and refuses a deal that was already recorded.
 */
export function CloseDealDialog({
  open,
  onOpenChange,
  lead,
  initialPropertyId,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: ClosingLead;
  /** Property to start with, for example the one chosen in Negotiation. */
  initialPropertyId?: string | null;
  onClosed?: () => void;
}) {
  const close = useCloseLeadDeal();
  const today = qatarDayKey(Date.now());
  const { data: refs } = useLeadReferences(open ? lead.id : undefined);
  const { data: offers = [] } = useLeadOffers(open ? lead.id : undefined);
  const [values, setValues] = useState<ClosingValues>(() =>
    closingDefaults({ lead, todayIso: today }),
  );
  const [touched, setTouched] = useState(false);
  const commissionTouched = useRef(false);
  const seededFor = useRef<string | null>(null);

  const interests = useMemo(
    () =>
      (refs?.interests ?? []) as unknown as {
        property_id: string;
        status: string | null;
        properties: { title: string; reference_code: string | null } | null;
      }[],
    [refs],
  );
  const { data: facts } = usePropertyFacts(values.property_id || null);

  // Start with the property under negotiation (or the only interest), once, when the dialog opens.
  useEffect(() => {
    if (!open) {
      seededFor.current = null;
      setTouched(false);
      commissionTouched.current = false;
      return;
    }
    if (seededFor.current === lead.id || !refs) return;
    seededFor.current = lead.id;
    const chosen =
      initialPropertyId ??
      interests.find((i) => i.status === "reserved")?.property_id ??
      (interests.length === 1 ? interests[0].property_id : null);
    setValues({ ...closingDefaults({ lead, todayIso: today }), property_id: chosen ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, refs]);

  // When the property is known, fill the price (from an accepted offer first) and the type.
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !values.property_id || !facts || facts.id !== values.property_id) return;
    if (filledFor.current === values.property_id) return;
    filledFor.current = values.property_id;
    const accepted = offers.find(
      (o) => o.property_id === values.property_id && o.status === "accepted" && o.amount != null,
    );
    const price = accepted?.amount ?? facts.price;
    setValues((p) => ({
      ...p,
      transaction_type: closingTypeFor(facts.purpose, lead.transaction_intent),
      price: price != null ? String(price) : p.price,
      currency: facts.currency || p.currency || "QAR",
    }));
  }, [open, values.property_id, facts, offers, lead.transaction_intent]);
  useEffect(() => {
    if (!open) filledFor.current = null;
  }, [open]);

  // Commission follows the rate until the person types an amount themselves.
  useEffect(() => {
    if (commissionTouched.current) return;
    const amount = commissionFor(
      toNumber(values.price),
      values.commission_rate.trim() ? toNumber(values.commission_rate) : null,
    );
    setValues((p) =>
      p.commission_amount === (amount != null ? String(amount) : "")
        ? p
        : { ...p, commission_amount: amount != null ? String(amount) : "" },
    );
  }, [values.price, values.commission_rate]);

  const set = <K extends keyof ClosingValues>(k: K, v: ClosingValues[K]) =>
    setValues((p) => ({ ...p, [k]: v }));
  const errors = touched ? validateClosing(values, today) : {};
  const mismatch =
    facts && values.property_id === facts.id
      ? values.transaction_type === "sale" && facts.purpose === "rent"
        ? "This property is listed for rent, so it cannot be recorded as a sale."
        : values.transaction_type === "rental" &&
            ["sale", "off_plan", "off_plan_resale"].includes(facts.purpose ?? "")
          ? "This property is listed for sale, so it cannot be recorded as a rental."
          : null
      : null;

  async function submit() {
    setTouched(true);
    const problems = validateClosing(values, today);
    if (Object.keys(problems).length > 0 || mismatch) {
      toast.error(mismatch ?? Object.values(problems)[0] ?? "Check the highlighted fields.");
      return;
    }
    try {
      const r = await close.mutateAsync({ leadId: lead.id, values });
      toast.success(r.summary);
      onOpenChange(false);
      onClosed?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const verb = values.transaction_type === "rental" ? "Rented" : "Sold";

  return (
    <DrawerShell
      open={open}
      onOpenChange={(v) => !close.isPending && onOpenChange(v)}
      ariaLabel="Close deal"
      widthClassName="max-w-2xl"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">Close deal: {lead.full_name}</h3>
          <p className="text-xs text-muted-foreground">
            Records the {values.transaction_type === "rental" ? "rental" : "sale"} and marks the
            lead Won. The property becomes {verb}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
          disabled={close.isPending}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Deal</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Property *" error={errors.property_id ?? mismatch ?? undefined} full>
              {interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {interests.map((i) => (
                    <button
                      key={i.property_id}
                      type="button"
                      onClick={() => set("property_id", i.property_id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        values.property_id === i.property_id
                          ? "border-qbay bg-qbay-tint text-qbay"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {i.properties?.reference_code ? `${i.properties.reference_code} · ` : ""}
                      {i.properties?.title ?? "Property"}
                      {i.status === "reserved" ? " (in negotiation)" : ""}
                    </button>
                  ))}
                </div>
              )}
              <PropertySearchSelect
                value={values.property_id || null}
                onChange={(id) => set("property_id", id ?? "")}
                purpose={values.transaction_type === "rental" ? "rent" : "sale"}
                placeholder={
                  interests.length ? "Or search another property" : "Search and select a property"
                }
              />
            </Field>
            <Field label="Sale or rental *">
              <SelectField
                value={values.transaction_type}
                onChange={(v) => set("transaction_type", (v ?? "sale") as ClosingType)}
                options={CLOSING_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                allowClear={false}
              />
            </Field>
            <Field label="Actual transaction date *" error={errors.closing_date}>
              <input
                type="date"
                className={inputCls}
                max={today}
                value={values.closing_date}
                onChange={(e) => set("closing_date", e.target.value)}
              />
            </Field>
            <Field
              label="Agreed price *"
              error={errors.price}
              hint={
                facts?.price != null
                  ? `Listed at ${fmtMoney(facts.price, facts.currency)}`
                  : undefined
              }
            >
              <input
                inputMode="decimal"
                className={inputCls}
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <input
                className={inputCls}
                value={values.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
                maxLength={3}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">
            {values.transaction_type === "rental" ? "Tenant" : "Buyer"}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client name *" error={errors.client_name}>
              <input
                className={inputCls}
                value={values.client_name}
                onChange={(e) => set("client_name", e.target.value)}
              />
            </Field>
            <Field label="Phone *" error={errors.client_phone}>
              <input
                className={inputCls}
                value={values.client_phone}
                onChange={(e) => set("client_phone", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                value={values.client_email}
                onChange={(e) => set("client_email", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Payment</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment method *" error={errors.payment_method}>
              <SelectField
                value={values.payment_method || null}
                onChange={(v) => set("payment_method", v ?? "")}
                options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                placeholder="Select method"
                allowClear={false}
              />
            </Field>
            <Field label="Payment status *" error={errors.payment_status}>
              <SelectField
                value={values.payment_status || null}
                onChange={(v) => set("payment_status", v ?? "")}
                options={PAYMENT_STATUS_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
                placeholder="Select status"
                allowClear={false}
              />
            </Field>
            <Field
              label="Payment details"
              full
              hint="Reference, instalment plan or anything accounting should know."
            >
              <input
                className={inputCls}
                value={values.payment_details}
                onChange={(e) => set("payment_details", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Commission</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Commission rate (%)" error={errors.commission_rate}>
              <input
                inputMode="decimal"
                className={inputCls}
                value={values.commission_rate}
                onChange={(e) => {
                  commissionTouched.current = false;
                  set("commission_rate", e.target.value);
                }}
              />
            </Field>
            <Field
              label="Commission amount"
              error={errors.commission_amount}
              hint="Follows the rate until you type an amount."
            >
              <input
                inputMode="decimal"
                className={inputCls}
                value={values.commission_amount}
                onChange={(e) => {
                  commissionTouched.current = true;
                  set("commission_amount", e.target.value);
                }}
              />
            </Field>
            <Field label="Notes" full>
              <textarea
                className={cn(inputCls, "h-20 py-2")}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={close.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={close.isPending}>
          {close.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Close deal
        </Button>
      </div>
    </DrawerShell>
  );
}
