import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Plus, Users, CalendarClock, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { useProperties, useUpdateProperty } from "@/hooks/use-properties";
import {
  useManagedProperties,
  useTenancies,
  useTenants,
  useCreateTenant,
  useCreateTenancy,
  useUpdateTenancy,
  useRentSchedule,
  useGenerateRentSchedule,
  useRentPayments,
  useRecordRentPayment,
} from "@/hooks/use-property-management";
import { fmtMoney, fmtDate, LEASE_STATUSES, RENEWAL_STATES, PAYMENT_FREQUENCIES } from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/property-management")({
  head: () => ({ meta: [{ title: "Property Management" }] }),
  component: PropertyManagementPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const tabs = ["Dashboard", "Managed Properties", "Tenants", "Tenancies", "Rent Schedule"] as const;

function PropertyManagementPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Dashboard");
  const { data: managed = [] } = useManagedProperties();
  const { data: tenancies = [] } = useTenancies();
  const { data: payments = [] } = useRentPayments();
  const { data: schedule = [] } = useRentSchedule();

  const activeTenancies = tenancies.filter((t) => t.status === "active");
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = activeTenancies.filter((t) => t.lease_end && new Date(t.lease_end) <= in30 && new Date(t.lease_end) >= now);
  const rentDue = schedule.filter((s) => s.status === "due");
  const rentOverdue = schedule.filter((s) => s.status === "overdue" || (s.status === "due" && new Date(s.due_date) < now));
  const outstandingBalance = rentOverdue.reduce((a, s) => a + s.amount, 0) + rentDue.reduce((a, s) => a + s.amount, 0);
  const occupied = managed.filter((p) => tenancies.some((t) => t.property_id === p.id && t.status === "active")).length;
  const recentPayments = payments.slice(0, 8);

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
        <PageHeader
          eyebrow="Operations"
          title="Property Management"
          description="Managed properties, tenants, tenancies and rent collection."
        />

        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Managed properties" value={String(managed.length)} />
              <MetricCard label="Occupied" value={String(occupied)} />
              <MetricCard label="Vacant" value={String(Math.max(managed.length - occupied, 0))} />
              <MetricCard label="Active tenancies" value={String(activeTenancies.length)} />
              <MetricCard label="Expiring (30d)" value={String(expiring.length)} />
              <MetricCard label="Outstanding" value={fmtMoney(outstandingBalance, "QAR")} />
            </div>
            <Card>
              <h4 className="text-sm font-semibold">Expiring contracts (next 30 days)</h4>
              {expiring.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nothing expiring soon.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {expiring.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span>{t.tenants?.full_name ?? t.tenant_name ?? "Tenant"} · {t.properties?.title ?? "-"}</span>
                      <span className="text-muted-foreground">Ends {fmtDate(t.lease_end)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h4 className="text-sm font-semibold">Recent payments</h4>
              {recentPayments.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {recentPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="capitalize">{p.method ?? "Payment"} · {p.status}</span>
                      <span className="text-muted-foreground">{fmtMoney(p.amount, p.currency)} · {fmtDate(p.received_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === "Managed Properties" && <ManagedPropertiesTab />}
        {tab === "Tenants" && <TenantsTab />}
        {tab === "Tenancies" && <TenanciesTab />}
        {tab === "Rent Schedule" && <RentScheduleTab />}
      </PermissionGate>
    </AppShell>
  );
}

function ManagedPropertiesTab() {
  const { data: managed = [] } = useManagedProperties();
  const { data: allProperties = [] } = useProperties({ status: "all" });
  const { data: tenancies = [] } = useTenancies();
  const update = useUpdateProperty();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const [addId, setAddId] = useState<string | null>(null);
  const unmanaged = allProperties.filter((p) => !managed.some((m) => m.id === p.id));

  return (
    <div className="space-y-3">
      {canEdit && (
        <Card>
          <h4 className="text-sm font-semibold">Add a property to management</h4>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <SearchableSelectField
              value={addId}
              onChange={setAddId}
              options={unmanaged.map((p) => ({ value: p.id, label: `${p.reference_code ? p.reference_code + " · " : ""}${p.title}` }))}
              placeholder="Select property"
              searchPlaceholder="Search properties..."
            />
            <Button
              size="sm"
              disabled={!addId || update.isPending}
              onClick={async () => {
                try {
                  await update.mutateAsync({ id: addId!, patch: { is_managed: true } });
                  setAddId(null);
                  toast.success("Added to management");
                } catch (e) { toast.error((e as Error).message); }
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </Card>
      )}
      {managed.length === 0 ? (
        <EmptyState icon={<Building2 className="h-4 w-4" />} title="No managed properties yet" />
      ) : (
        <div className="space-y-2">
          {managed.map((p: any) => {
            const activeTenancy = tenancies.find((t) => t.property_id === p.id && t.status === "active");
            return (
              <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="text-sm font-medium hover:underline">
                    {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">Owner: {p.owners?.name ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", activeTenancy ? "bg-pastel-green" : "bg-muted text-muted-foreground")}>
                    {activeTenancy ? `Occupied · ${activeTenancy.tenants?.full_name ?? activeTenancy.tenant_name ?? "Tenant"}` : "Vacant"}
                  </span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try { await update.mutateAsync({ id: p.id, patch: { is_managed: false } }); toast.success("Removed from management"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TenantsTab() {
  const [search, setSearch] = useState("");
  const { data: tenants = [] } = useTenants(search);
  const [open, setOpen] = useState(false);
  const { can } = usePermissions();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenants..." className={cn(inputCls, "w-full max-w-xs")} />
        {can("properties", "edit") && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Tenant</Button>}
      </div>
      {tenants.length === 0 ? (
        <EmptyState icon={<Users className="h-4 w-4" />} title="No tenants yet" />
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{t.full_name}</p>
                <p className="text-xs text-muted-foreground">{t.phone ?? "-"} · {t.email ?? "-"}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
      <TenantDrawer open={open} onOpenChange={setOpen} />
    </div>
  );
}

function TenantDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateTenant();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Add tenant">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Add Tenant</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form
        className="flex-1 space-y-3 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return toast.error("Name is required");
          try {
            await create.mutateAsync({ full_name: name.trim(), phone: phone || null, email: email || null, notes: notes || null });
            toast.success("Tenant added");
            setName(""); setPhone(""); setEmail(""); setNotes("");
            onOpenChange(false);
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Full name *</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</span>
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</span>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
          <textarea className={cn(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={create.isPending}>{create.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function TenanciesTab() {
  const { data: tenancies = [] } = useTenancies();
  const [open, setOpen] = useState(false);
  const [genFor, setGenFor] = useState<string | null>(null);
  const update = useUpdateTenancy();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Tenancy</Button>
        </div>
      )}
      {tenancies.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-4 w-4" />} title="No tenancies yet" />
      ) : (
        <div className="space-y-2">
          {tenancies.map((t) => (
            <Card key={t.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t.tenants?.full_name ?? t.tenant_name ?? "Tenant"} · {t.properties?.title ?? "-"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(t.lease_start)} - {fmtDate(t.lease_end)} · {fmtMoney(t.rent_amount, t.currency)} / {t.payment_frequency ?? "monthly"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <SelectField
                      className="h-8 w-32 text-xs"
                      value={t.status}
                      onChange={(v) => update.mutate({ id: t.id, patch: { status: v ?? t.status } })}
                      options={LEASE_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                      allowClear={false}
                    />
                  )}
                  {canEdit && (
                    <SelectField
                      className="h-8 w-36 text-xs"
                      value={t.renewal_state}
                      onChange={(v) => update.mutate({ id: t.id, patch: { renewal_state: v ?? t.renewal_state } })}
                      options={RENEWAL_STATES.map((s) => ({ value: s, label: titleCase(s) }))}
                      allowClear={false}
                    />
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setGenFor(t.id)}>Generate rent schedule</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <TenancyDrawer open={open} onOpenChange={setOpen} />
      {genFor && <GenerateScheduleDialog leaseId={genFor} tenancy={tenancies.find((t) => t.id === genFor)!} onClose={() => setGenFor(null)} />}
    </div>
  );
}

function GenerateScheduleDialog({ leaseId, tenancy, onClose }: { leaseId: string; tenancy: any; onClose: () => void }) {
  const generate = useGenerateRentSchedule();
  const [months, setMonths] = useState(12);
  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Generate rent schedule">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Generate Rent Schedule</h3>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Creates due installments starting {fmtDate(tenancy.lease_start)} at {fmtMoney(tenancy.rent_amount, tenancy.currency)} per {tenancy.payment_frequency ?? "monthly"} period.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Coverage (months)</span>
          <input className={inputCls} type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={generate.isPending}
            onClick={async () => {
              try {
                await generate.mutateAsync({ lease: tenancy, months });
                toast.success("Rent schedule generated");
                onClose();
              } catch (e) { toast.error((e as Error).message); }
            }}
          >
            Generate
          </Button>
        </div>
      </div>
    </DrawerShell>
  );
}

function TenancyDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateTenancy();
  const { data: managed = [] } = useManagedProperties();
  const { data: tenants = [] } = useTenants();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [frequency, setFrequency] = useState("monthly");

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Add tenancy">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Add Tenancy</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form
        className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!propertyId) return toast.error("Select a managed property");
          try {
            await create.mutateAsync({
              property_id: propertyId,
              tenant_id: tenantId,
              lease_start: start || null,
              lease_end: end || null,
              rent_amount: rent ? Number(rent) : null,
              deposit_amount: deposit ? Number(deposit) : null,
              payment_frequency: frequency,
              status: "active",
            });
            toast.success("Tenancy created");
            onOpenChange(false);
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Managed property *</span>
          <SearchableSelectField value={propertyId} onChange={setPropertyId} options={managed.map((p: any) => ({ value: p.id, label: p.title }))} placeholder="Select property" searchPlaceholder="Search..." />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tenant</span>
          <SearchableSelectField value={tenantId} onChange={setTenantId} options={tenants.map((t) => ({ value: t.id, label: t.full_name }))} placeholder="Select tenant" searchPlaceholder="Search..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Start date</span>
          <input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">End date</span>
          <input className={inputCls} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rent amount</span>
          <input className={inputCls} type="number" value={rent} onChange={(e) => setRent(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Deposit</span>
          <input className={inputCls} type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Payment frequency</span>
          <SelectField value={frequency} onChange={(v) => setFrequency(v ?? "monthly")} options={PAYMENT_FREQUENCIES.map((f) => ({ value: f, label: titleCase(f) }))} allowClear={false} />
        </label>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={create.isPending}>{create.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function RentScheduleTab() {
  const { data: schedule = [] } = useRentSchedule();
  const record = useRecordRentPayment();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const [payFor, setPayFor] = useState<any | null>(null);

  const now = new Date();

  return (
    <div className="space-y-2">
      {schedule.length === 0 ? (
        <EmptyState icon={<Wallet className="h-4 w-4" />} title="No rent schedule yet" description="Generate one from a tenancy." />
      ) : (
        schedule.map((s) => {
          const overdue = s.status === "due" && new Date(s.due_date) < now;
          return (
            <Card key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{s.property_leases?.properties?.title ?? "Property"}</p>
                <p className="text-xs text-muted-foreground">Due {fmtDate(s.due_date)} · {fmtMoney(s.amount, s.currency)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", s.status === "paid" ? "bg-pastel-green" : overdue ? "bg-destructive/15 text-destructive" : s.status === "partial" ? "bg-pastel-blue" : "bg-muted text-muted-foreground")}>
                  {overdue ? "overdue" : s.status}
                </span>
                {canEdit && s.status !== "paid" && (
                  <Button size="sm" variant="outline" onClick={() => setPayFor(s)}>Record payment</Button>
                )}
              </div>
            </Card>
          );
        })
      )}
      {payFor && (
        <RecordPaymentDialog
          item={payFor}
          onClose={() => setPayFor(null)}
          onSubmit={async (amount, method) => {
            try {
              await record.mutateAsync({
                property_lease_id: payFor.property_lease_id,
                rent_schedule_item_id: payFor.id,
                amount,
                currency: payFor.currency,
                method,
                status: "received",
              });
              toast.success("Payment recorded");
              setPayFor(null);
            } catch (e) { toast.error((e as Error).message); }
          }}
        />
      )}
    </div>
  );
}

function RecordPaymentDialog({ item, onClose, onSubmit }: { item: any; onClose: () => void; onSubmit: (amount: number, method: string) => void }) {
  const [amount, setAmount] = useState(String(item.amount));
  const [method, setMethod] = useState("bank_transfer");
  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Record payment">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Record Payment</h3>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</span>
          <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Method</span>
          <SelectField value={method} onChange={(v) => setMethod(v ?? "bank_transfer")} options={["bank_transfer", "cash", "cheque", "card"].map((m) => ({ value: m, label: titleCase(m) }))} allowClear={false} />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSubmit(Number(amount), method)}>Record</Button>
        </div>
      </div>
    </DrawerShell>
  );
}
