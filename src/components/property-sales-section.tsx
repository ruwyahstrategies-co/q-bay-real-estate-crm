import { useEffect, useRef, useState } from "react";
import { BadgeDollarSign, FileText, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField, SearchableSelectField } from "./select-field";
import { UploadDropzone } from "./upload-dropzone";
import { EmptyState } from "./empty-state";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { downloadUpload, useUploads } from "@/hooks/use-uploads";
import {
  useRecordPropertySale,
  usePropertySales,
  type PropertySale,
} from "@/hooks/use-property-sales";
import { fmtDate, fmtMoney, type Property } from "@/lib/db";
import { normalizePhone, phoneError } from "@/lib/phone";
import { qatarDayKey } from "@/lib/qatar-time";
import { cn } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pending",
  partial: "Part paid",
  paid: "Paid in full",
};

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

type FormState = {
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  saleDate: string;
  salePrice: string;
  currency: string;
  agentId: string | null;
  commissionRate: string;
  commissionAmount: string;
  paymentStatus: string | null;
  paymentDetails: string;
  notes: string;
};

function initialForm(property: Property, sale: PropertySale | null): FormState {
  return {
    buyerName: sale?.buyer_name ?? "",
    buyerPhone: sale?.buyer_phone ?? "",
    buyerEmail: sale?.buyer_email ?? "",
    saleDate: sale?.sale_date ?? qatarDayKey(new Date()),
    salePrice: sale?.sale_price != null ? String(sale.sale_price) : (property.price != null ? String(property.price) : ""),
    currency: sale?.currency ?? property.currency ?? "QAR",
    agentId: sale?.agent_id ?? property.assigned_agent_id ?? null,
    commissionRate: sale?.commission_rate != null ? String(sale.commission_rate) : "",
    commissionAmount: sale?.commission_amount != null ? String(sale.commission_amount) : "",
    paymentStatus: sale?.payment_status ?? null,
    paymentDetails: sale?.payment_details ?? "",
    notes: sale?.notes ?? "",
  };
}

function SaleDrawer({
  open,
  onOpenChange,
  property,
  sale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property;
  sale: PropertySale | null;
}) {
  const { data: team = [] } = useTeamMembers();
  const record = useRecordPropertySale();
  const [form, setForm] = useState<FormState>(() => initialForm(property, sale));
  useEffect(() => {
    if (open) setForm(initialForm(property, sale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id, property.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  function onRateChange(v: string) {
    setForm((p) => {
      const rate = Number(v);
      const price = Number(p.salePrice);
      const amount =
        v !== "" && Number.isFinite(rate) && Number.isFinite(price) && price > 0
          ? String(Math.round(((price * rate) / 100) * 100) / 100)
          : p.commissionAmount;
      return { ...p, commissionRate: v, commissionAmount: amount };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (record.isPending) return;
    if (!form.buyerName.trim()) return toast.error("Buyer name is required");
    const phoneProblem = phoneError(form.buyerPhone);
    if (phoneProblem) return toast.error(`Buyer phone: ${phoneProblem.toLowerCase()}`);
    if (!form.saleDate) return toast.error("Sale date is required");
    const price = Number(form.salePrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error("Sale price is required");
    try {
      await record.mutateAsync({
        propertyId: property.id,
        saleId: sale?.id ?? null,
        buyerName: form.buyerName.trim(),
        buyerPhone: normalizePhone(form.buyerPhone),
        buyerEmail: form.buyerEmail.trim(),
        saleDate: form.saleDate,
        salePrice: price,
        currency: form.currency || "QAR",
        agentId: form.agentId,
        commissionRate: form.commissionRate === "" ? null : Number(form.commissionRate),
        commissionAmount: form.commissionAmount === "" ? null : Number(form.commissionAmount),
        paymentStatus: (form.paymentStatus as "pending" | "partial" | "paid" | null) ?? null,
        paymentDetails: form.paymentDetails,
        notes: form.notes,
      });
      toast.success(sale ? "Sale details updated" : "Sale recorded and property marked Sold");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Sale details">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">{sale ? "Edit sale details" : "Record sale"}</h3>
          <p className="text-xs text-muted-foreground">
            {property.reference_code ? `${property.reference_code} · ` : ""}
            {property.title}
          </p>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        className="grid flex-1 grid-cols-1 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-2"
        onSubmit={submit}
      >
        <Field label="Buyer name *" full>
          <input
            className={inputCls}
            value={form.buyerName}
            onChange={(e) => set("buyerName", e.target.value)}
            required
          />
        </Field>
        <Field label="Buyer phone *">
          <input
            className={inputCls}
            type="tel"
            placeholder="+974..."
            value={form.buyerPhone}
            onChange={(e) => set("buyerPhone", e.target.value)}
            required
          />
        </Field>
        <Field label="Buyer email">
          <input
            className={inputCls}
            type="email"
            value={form.buyerEmail}
            onChange={(e) => set("buyerEmail", e.target.value)}
          />
        </Field>
        <Field label="Sale date *">
          <input
            className={inputCls}
            type="date"
            value={form.saleDate}
            onChange={(e) => set("saleDate", e.target.value)}
            required
          />
        </Field>
        <Field label="Sale price *">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="any"
            value={form.salePrice}
            onChange={(e) => set("salePrice", e.target.value)}
            required
          />
        </Field>
        <Field label="Currency">
          <input
            className={inputCls}
            value={form.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            maxLength={3}
          />
        </Field>
        <Field label="Responsible agent">
          <SearchableSelectField
            value={form.agentId}
            onChange={(v) => set("agentId", v)}
            options={team.map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select agent"
            searchPlaceholder="Search agents..."
          />
        </Field>
        <Field label="Commission rate (%)">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="any"
            value={form.commissionRate}
            onChange={(e) => onRateChange(e.target.value)}
          />
        </Field>
        <Field label="Commission amount">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="any"
            value={form.commissionAmount}
            onChange={(e) => set("commissionAmount", e.target.value)}
          />
        </Field>
        <Field label="Payment status">
          <SelectField
            value={form.paymentStatus}
            onChange={(v) => set("paymentStatus", v)}
            options={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="Not specified"
          />
        </Field>
        <Field label="Payment details" full>
          <textarea
            className={cn(inputCls, "h-20 py-2")}
            placeholder="Deposit, instalments, bank reference..."
            value={form.paymentDetails}
            onChange={(e) => set("paymentDetails", e.target.value)}
          />
        </Field>
        <Field label="Notes" full>
          <textarea
            className={cn(inputCls, "h-20 py-2")}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">
          The seller is taken from the property's owner. Sale documents can be attached once the
          sale is saved.
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={record.isPending}>
            {record.isPending ? "Saving..." : sale ? "Save changes" : "Record sale"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function SaleDocuments({ sale, propertyId }: { sale: PropertySale; propertyId: string }) {
  const { can } = usePermissions();
  const { data: files = [] } = useUploads({ transactionId: sale.id });
  const canUpload = can("uploads", "upload");
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Sale documents
      </p>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents attached.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{f.filename}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadUpload(f).catch((e) => toast.error((e as Error).message))}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="mt-2">
          <UploadDropzone
            title="Attach sale document"
            description="Sale agreement, transfer papers, payment receipts. Stored privately."
            categoryKey="property_documents"
            propertyId={propertyId}
            transactionId={sale.id}
          />
        </div>
      )}
    </div>
  );
}

export function PropertySalesSection({ property }: { property: Property }) {
  const { can } = usePermissions();
  const canRecord = can("properties", "edit") || can("accounting", "manage");
  const { data: sales = [], isLoading } = usePropertySales(property.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PropertySale | null>(null);

  // Prompt for sale details the moment staff flip a property to Sold on this page.
  const prevAvailability = useRef(property.availability);
  useEffect(() => {
    const was = prevAvailability.current;
    prevAvailability.current = property.availability;
    if (
      canRecord &&
      !isLoading &&
      was !== "sold" &&
      property.availability === "sold" &&
      sales.length === 0
    ) {
      setEditing(null);
      setDrawerOpen(true);
    }
  }, [property.availability, canRecord, isLoading, sales.length]);

  const needsDetails = property.availability === "sold" && !isLoading && sales.length === 0;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="h-4 w-4" />
            <h4 className="text-sm font-semibold">Sale history</h4>
          </div>
          {canRecord && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              Record sale
            </Button>
          )}
        </div>

        {needsDetails && (
          <div className="mt-3 rounded-lg border border-qbay/30 bg-qbay-tint px-3 py-2 text-xs">
            This property is marked Sold but has no sale details yet.
            {canRecord ? " Record the buyer, price and commission." : ""}
          </div>
        )}

        {sales.length === 0 ? (
          !needsDetails && <EmptyState compact title="No sales recorded" />
        ) : (
          <div className="mt-3 space-y-3">
            {sales.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{fmtMoney(s.sale_price, s.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      Sold {fmtDate(s.sale_date)} to {s.buyer_name ?? "-"}
                    </p>
                  </div>
                  {canRecord && s.private_visible && (
                    <button
                      className="rounded-md p-1.5 hover:bg-muted"
                      aria-label="Edit sale details"
                      onClick={() => {
                        setEditing(s);
                        setDrawerOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Seller</dt>
                  <dd>{s.seller_name ?? "-"}</dd>
                  <dt className="text-muted-foreground">Responsible agent</dt>
                  <dd>{s.agent_name ?? "-"}</dd>
                  {s.private_visible && (
                    <>
                      <dt className="text-muted-foreground">Buyer phone</dt>
                      <dd>{s.buyer_phone ?? "-"}</dd>
                      <dt className="text-muted-foreground">Buyer email</dt>
                      <dd>{s.buyer_email ?? "-"}</dd>
                      <dt className="text-muted-foreground">Commission</dt>
                      <dd>
                        {s.commission_amount != null
                          ? fmtMoney(s.commission_amount, s.currency)
                          : "-"}
                        {s.commission_rate != null ? ` (${s.commission_rate}%)` : ""}
                      </dd>
                      <dt className="text-muted-foreground">Payment</dt>
                      <dd>
                        {s.payment_status ? (PAYMENT_LABELS[s.payment_status] ?? s.payment_status) : "-"}
                        {s.payment_details ? ` · ${s.payment_details}` : ""}
                      </dd>
                      {s.notes && (
                        <>
                          <dt className="text-muted-foreground">Notes</dt>
                          <dd>{s.notes}</dd>
                        </>
                      )}
                    </>
                  )}
                </dl>
                {s.private_visible ? (
                  <SaleDocuments sale={s} propertyId={property.id} />
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Buyer contact, commission, payment and documents
                    are visible to the responsible agent, accounting and administrators.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <SaleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        property={property}
        sale={editing}
      />
    </>
  );
}
