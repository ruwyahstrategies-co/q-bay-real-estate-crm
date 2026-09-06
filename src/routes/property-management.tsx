import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, FileText, Plus, Users, CalendarClock, Wallet, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { MetricCard } from "@/components/metric-card";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { UploadDropzone } from "@/components/upload-dropzone";
import { usePermissions } from "@/hooks/use-auth";
import { useProperties, useUpdateProperty } from "@/hooks/use-properties";
import { downloadUpload, useUploads } from "@/hooks/use-uploads";
import {
  useManagedProperties,
  useTenancies,
  useTenants,
  useTenant,
  useCreateTenant,
  useUpdateTenant,
  useCreateTenancy,
  useUpdateTenancy,
  useRentSchedule,
  useMarkOverdueRentItems,
  useGenerateRentSchedule,
  useRentPayments,
  useRecordRentPayment,
  useMaintenanceIssues,
  useCreateMaintenanceIssue,
  useUpdateMaintenanceIssue,
} from "@/hooks/use-property-management";
import {
  fmtMoney,
  fmtDate,
  fmtDateTime,
  fmtSize,
  LEASE_STATUSES,
  RENEWAL_STATES,
  PAYMENT_FREQUENCIES,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_REPORTED_BY,
} from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/property-management")({
  head: () => ({ meta: [{ title: "Property Management" }] }),
  component: PropertyManagementPage,
});

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const tabs = [
  "Dashboard",
  "Managed Properties",
  "Tenants",
  "Tenancies",
  "Rent Schedule",
  "Maintenance",
  "Documents",
] as const;

function PropertyManagementPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Dashboard");
  const { data: managed = [] } = useManagedProperties();
  const { data: tenancies = [] } = useTenancies();
  const { data: payments = [] } = useRentPayments();
  const { data: schedule = [] } = useRentSchedule();
  const { data: maintenance = [] } = useMaintenanceIssues();
  const markOverdue = useMarkOverdueRentItems();

  // Rent items only flip from "due" to "overdue" when someone asks; do that
  // once whenever the module is opened so the dashboard and schedule agree.
  useEffect(() => {
    markOverdue.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTenancies = tenancies.filter((t) => t.status === "active");
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = activeTenancies.filter(
    (t) => t.lease_end && new Date(t.lease_end) <= in30 && new Date(t.lease_end) >= now,
  );
  const rentDue = schedule.filter((s) => s.status === "due");
  const rentOverdue = schedule.filter((s) => s.status === "overdue");
  const rentPartial = schedule.filter((s) => s.status === "partial");
  const outstandingBalance =
    rentOverdue.reduce((a, s) => a + s.amount, 0) + rentDue.reduce((a, s) => a + s.amount, 0);
  const occupied = managed.filter((p) =>
    tenancies.some((t) => t.property_id === p.id && t.status === "active"),
  ).length;
  const openIssues = maintenance.filter(
    (m) => m.status === "open" || m.status === "in_progress",
  ).length;
  const recentPayments = payments.slice(0, 8);

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
        <PageHeader
          eyebrow="Operations"
          title="Property Management"
          description="Managed properties, tenants, tenancies, rent collection and maintenance."
        />

        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
              <MetricCard label="Managed properties" value={String(managed.length)} />
              <MetricCard label="Occupied" value={String(occupied)} />
              <MetricCard label="Vacant" value={String(Math.max(managed.length - occupied, 0))} />
              <MetricCard label="Active tenancies" value={String(activeTenancies.length)} />
              <MetricCard label="Expiring (30d)" value={String(expiring.length)} />
              <MetricCard label="Overdue rent" value={String(rentOverdue.length)} />
              <MetricCard label="Open issues" value={String(openIssues)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard label="Outstanding balance" value={fmtMoney(outstandingBalance, "QAR")} />
              <MetricCard label="Partially paid installments" value={String(rentPartial.length)} />
            </div>
            <Card>
              <h4 className="text-sm font-semibold">Expiring contracts (next 30 days)</h4>
              {expiring.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nothing expiring soon.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {expiring.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span>
                        {t.tenants?.full_name ?? t.tenant_name ?? "Tenant"} ·{" "}
                        {t.properties?.title ?? "-"}
                      </span>
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
                      <span className="capitalize">
                        {p.method ?? "Payment"} · {p.status}
                      </span>
                      <span className="text-muted-foreground">
                        {fmtMoney(p.amount, p.currency)} · {fmtDate(p.received_date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h4 className="text-sm font-semibold">Open maintenance issues</h4>
              {openIssues === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nothing open right now.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {maintenance
                    .filter((m) => m.status === "open" || m.status === "in_progress")
                    .slice(0, 8)
                    .map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span>
                          {m.title} · {m.properties?.title ?? "-"}
                        </span>
                        <span className="capitalize text-muted-foreground">
                          {m.priority} · {m.status.replace("_", " ")}
                        </span>
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
        {tab === "Maintenance" && <MaintenanceTab />}
        {tab === "Documents" && <DocumentsTab />}
      </PermissionGate>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------ */
/* Managed properties                                                        */
/* ------------------------------------------------------------------------ */

function ManagedPropertiesTab() {
  const { data: managed = [] } = useManagedProperties();
  const { data: allProperties = [] } = useProperties({ status: "all" });
  const { data: tenancies = [] } = useTenancies();
  const { data: schedule = [] } = useRentSchedule();
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
              options={unmanaged.map((p) => ({
                value: p.id,
                label: `${p.reference_code ? p.reference_code + " · " : ""}${p.title}`,
              }))}
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
                } catch (e) {
                  toast.error((e as Error).message);
                }
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
            const activeTenancy = tenancies.find(
              (t) => t.property_id === p.id && t.status === "active",
            );
            const balance = schedule
              .filter((s) => s.property_leases?.property_id === p.id && s.status !== "paid")
              .reduce((a, s) => a + s.amount, 0);
            return (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="text-sm font-medium hover:underline"
                  >
                    {p.reference_code ? `${p.reference_code} · ` : ""}
                    {p.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Owner: {p.owners?.name ?? "-"}
                    {p.owners?.phone ? ` · ${p.owners.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      activeTenancy ? "bg-pastel-green" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {activeTenancy
                      ? `Occupied · ${activeTenancy.tenants?.full_name ?? activeTenancy.tenant_name ?? "Tenant"}`
                      : "Vacant"}
                  </span>
                  {balance > 0 && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                      Outstanding {fmtMoney(balance, "QAR")}
                    </span>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await update.mutateAsync({ id: p.id, patch: { is_managed: false } });
                          toast.success("Removed from management");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
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

/* ------------------------------------------------------------------------ */
/* Tenants                                                                   */
/* ------------------------------------------------------------------------ */

function TenantsTab() {
  const [search, setSearch] = useState("");
  const { data: tenants = [] } = useTenants(search);
  const { data: tenancies = [] } = useTenancies();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { can } = usePermissions();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenants..."
          className={cn(inputCls, "w-full max-w-xs")}
        />
        {can("properties", "edit") && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Tenant
          </Button>
        )}
      </div>
      {tenants.length === 0 ? (
        <EmptyState icon={<Users className="h-4 w-4" />} title="No tenants yet" />
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => {
            const history = tenancies.filter((ten) => ten.tenant_id === t.id);
            const active = history.find((h) => h.status === "active");
            return (
              <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <button onClick={() => setEditId(t.id)} className="text-left">
                  <p className="text-sm font-medium hover:underline">{t.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.phone ?? "-"} · {t.email ?? "-"}
                  </p>
                </button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {history.length} {history.length === 1 ? "tenancy" : "tenancies"}
                  </span>
                  {active && (
                    <span className="rounded-full bg-pastel-green px-2 py-0.5 text-[11px] text-foreground">
                      Currently active
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <TenantDrawer open={open} onOpenChange={setOpen} />
      {editId && <TenantDetailDrawer tenantId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}

function TenantDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateTenant();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [nationality, setNationality] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Add tenant">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Add Tenant</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        className="flex-1 space-y-3 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return toast.error("Name is required");
          try {
            await create.mutateAsync({
              full_name: name.trim(),
              phone: phone || null,
              email: email || null,
              id_number: idNumber || null,
              nationality: nationality || null,
              notes: notes || null,
            });
            toast.success("Tenant added");
            setName("");
            setPhone("");
            setEmail("");
            setIdNumber("");
            setNationality("");
            setNotes("");
            onOpenChange(false);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Full name *
          </span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Phone
          </span>
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </span>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            ID / passport number
          </span>
          <input
            className={inputCls}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Nationality
          </span>
          <input
            className={inputCls}
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </span>
          <textarea
            className={cn(inputCls, "h-20 py-2")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

/** Tenant profile: editable identity fields, tenancy history and their documents, opened from the Tenants list. */
function TenantDetailDrawer({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { data: tenant } = useTenant(tenantId);
  const { data: tenancies = [] } = useTenancies();
  const { data: documents = [] } = useUploads({ tenantId });
  const update = useUpdateTenant();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (tenant) {
      setName(tenant.full_name);
      setPhone(tenant.phone ?? "");
      setEmail(tenant.email ?? "");
      setNotes(tenant.notes ?? "");
    }
  }, [tenant]);

  const history = tenancies.filter((t) => t.tenant_id === tenantId);

  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Tenant profile">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Tenant Profile</h3>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!tenant ? (
        <div className="p-5 text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await update.mutateAsync({
                  id: tenantId,
                  patch: {
                    full_name: name.trim(),
                    phone: phone || null,
                    email: email || null,
                    notes: notes || null,
                  },
                });
                toast.success("Tenant updated");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Full name
              </span>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Phone
              </span>
              <input
                className={inputCls}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </span>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </span>
              <textarea
                className={cn(inputCls, "h-20 py-2")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
              />
            </label>
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={update.isPending}>
                  {update.isPending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            )}
          </form>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Tenancy history</h4>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No tenancies yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-border p-2.5 text-xs">
                    <p className="font-medium">{h.properties?.title ?? "Property"}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {fmtDate(h.lease_start)} - {fmtDate(h.lease_end)} ·{" "}
                      {fmtMoney(h.rent_amount, h.currency)} · {titleCase(h.status)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Documents</h4>
            <DocumentList documents={documents} />
            {canEdit && (
              <div className="mt-3">
                <UploadDropzone
                  title="Upload a tenant document"
                  description="ID, passport, employment letter"
                  categoryKey="tenant_documents"
                  tenantId={tenantId}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

/* ------------------------------------------------------------------------ */
/* Tenancies                                                                 */
/* ------------------------------------------------------------------------ */

function TenanciesTab() {
  const { data: tenancies = [] } = useTenancies();
  const [open, setOpen] = useState(false);
  const [genFor, setGenFor] = useState<string | null>(null);
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const update = useUpdateTenancy();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Tenancy
          </Button>
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
                  <p className="text-sm font-medium">
                    {t.tenants?.full_name ?? t.tenant_name ?? "Tenant"} ·{" "}
                    {t.properties?.title ?? "-"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(t.lease_start)} - {fmtDate(t.lease_end)} ·{" "}
                    {fmtMoney(t.rent_amount, t.currency)} / {t.payment_frequency ?? "monthly"}
                    {t.deposit_amount ? ` · Deposit ${fmtMoney(t.deposit_amount, t.currency)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <SelectField
                      className="h-8 w-32 text-xs"
                      value={t.status}
                      onChange={(v) =>
                        update.mutate({ id: t.id, patch: { status: v ?? t.status } })
                      }
                      options={LEASE_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                      allowClear={false}
                    />
                  )}
                  {canEdit && (
                    <SelectField
                      className="h-8 w-36 text-xs"
                      value={t.renewal_state}
                      onChange={(v) =>
                        update.mutate({ id: t.id, patch: { renewal_state: v ?? t.renewal_state } })
                      }
                      options={RENEWAL_STATES.map((s) => ({ value: s, label: titleCase(s) }))}
                      allowClear={false}
                    />
                  )}
                  <Button size="sm" variant="outline" onClick={() => setDocsFor(t.id)}>
                    <FileText className="h-3.5 w-3.5" /> Documents
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setGenFor(t.id)}>
                      Generate rent schedule
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <TenancyDrawer open={open} onOpenChange={setOpen} />
      {genFor && (
        <GenerateScheduleDialog
          leaseId={genFor}
          tenancy={tenancies.find((t) => t.id === genFor)!}
          onClose={() => setGenFor(null)}
        />
      )}
      {docsFor && <TenancyDocumentsDrawer leaseId={docsFor} onClose={() => setDocsFor(null)} />}
    </div>
  );
}

function TenancyDocumentsDrawer({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const { data: documents = [] } = useUploads({ propertyLeaseId: leaseId });
  const { can } = usePermissions();

  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Tenancy documents">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Tenancy Documents</h3>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <DocumentList documents={documents} />
        {can("properties", "edit") && (
          <UploadDropzone
            title="Upload the signed contract or an addendum"
            categoryKey="tenant_documents"
            propertyLeaseId={leaseId}
          />
        )}
      </div>
    </DrawerShell>
  );
}

function GenerateScheduleDialog({
  leaseId,
  tenancy,
  onClose,
}: {
  leaseId: string;
  tenancy: any;
  onClose: () => void;
}) {
  const generate = useGenerateRentSchedule();
  const [months, setMonths] = useState(12);
  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Generate rent schedule">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Generate Rent Schedule</h3>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Creates due installments starting {fmtDate(tenancy.lease_start)} at{" "}
          {fmtMoney(tenancy.rent_amount, tenancy.currency)} per{" "}
          {tenancy.payment_frequency ?? "monthly"} period.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Coverage (months)
          </span>
          <input
            className={inputCls}
            type="number"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={generate.isPending}
            onClick={async () => {
              try {
                await generate.mutateAsync({ lease: tenancy, months });
                toast.success("Rent schedule generated");
                onClose();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Generate
          </Button>
        </div>
      </div>
    </DrawerShell>
  );
}

function TenancyDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Managed property *
          </span>
          <SearchableSelectField
            value={propertyId}
            onChange={setPropertyId}
            options={managed.map((p: any) => ({ value: p.id, label: p.title }))}
            placeholder="Select property"
            searchPlaceholder="Search..."
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tenant
          </span>
          <SearchableSelectField
            value={tenantId}
            onChange={setTenantId}
            options={tenants.map((t) => ({ value: t.id, label: t.full_name }))}
            placeholder="Select tenant"
            searchPlaceholder="Search..."
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Start date
          </span>
          <input
            className={inputCls}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            End date
          </span>
          <input
            className={inputCls}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Rent amount
          </span>
          <input
            className={inputCls}
            type="number"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Deposit
          </span>
          <input
            className={inputCls}
            type="number"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Payment frequency
          </span>
          <SelectField
            value={frequency}
            onChange={(v) => setFrequency(v ?? "monthly")}
            options={PAYMENT_FREQUENCIES.map((f) => ({ value: f, label: titleCase(f) }))}
            allowClear={false}
          />
        </label>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

/* ------------------------------------------------------------------------ */
/* Rent schedule                                                             */
/* ------------------------------------------------------------------------ */

function RentScheduleTab() {
  const { data: schedule = [] } = useRentSchedule();
  const record = useRecordRentPayment();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const [payFor, setPayFor] = useState<any | null>(null);
  const [filter, setFilter] = useState<"all" | "due" | "overdue" | "partial" | "paid">("all");

  const filtered = filter === "all" ? schedule : schedule.filter((s) => s.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(["all", "due", "overdue", "partial", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-4 w-4" />}
          title="No rent schedule yet"
          description="Generate one from a tenancy."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">
                  {s.property_leases?.properties?.title ?? "Property"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Due {fmtDate(s.due_date)} · {fmtMoney(s.amount, s.currency)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] capitalize",
                    s.status === "paid"
                      ? "bg-pastel-green"
                      : s.status === "overdue"
                        ? "bg-destructive/15 text-destructive"
                        : s.status === "partial"
                          ? "bg-pastel-blue"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.status}
                </span>
                {canEdit && s.status !== "paid" && (
                  <Button size="sm" variant="outline" onClick={() => setPayFor(s)}>
                    Record payment
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {payFor && (
        <RecordPaymentDialog
          item={payFor}
          onClose={() => setPayFor(null)}
          onSubmit={async (amount, method, reference) => {
            try {
              await record.mutateAsync({
                property_lease_id: payFor.property_lease_id,
                rent_schedule_item_id: payFor.id,
                amount,
                currency: payFor.currency,
                method,
                notes: reference || null,
                status: "received",
              });
              toast.success("Payment recorded");
              setPayFor(null);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

function RecordPaymentDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: any;
  onClose: () => void;
  onSubmit: (amount: number, method: string, reference: string) => void;
}) {
  const [amount, setAmount] = useState(String(item.amount));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Record payment">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Record Payment</h3>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Amount
          </span>
          <input
            className={inputCls}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Method
          </span>
          <SelectField
            value={method}
            onChange={(v) => setMethod(v ?? "bank_transfer")}
            options={["bank_transfer", "cash", "cheque", "card"].map((m) => ({
              value: m,
              label: titleCase(m),
            }))}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reference (optional)
          </span>
          <input
            className={inputCls}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transfer ID, cheque number..."
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSubmit(Number(amount), method, reference)}>
            Record
          </Button>
        </div>
      </div>
    </DrawerShell>
  );
}

/* ------------------------------------------------------------------------ */
/* Maintenance                                                               */
/* ------------------------------------------------------------------------ */

function MaintenanceTab() {
  const { data: issues = [] } = useMaintenanceIssues();
  const update = useUpdateMaintenanceIssue();
  const [open, setOpen] = useState(false);
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Log Issue
          </Button>
        </div>
      )}
      {issues.length === 0 ? (
        <EmptyState icon={<Wrench className="h-4 w-4" />} title="No maintenance issues logged" />
      ) : (
        <div className="space-y-2">
          {issues.map((i) => (
            <Card key={i.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {i.properties?.title ?? "Property"} · {titleCase(i.category)} · Reported by{" "}
                    {titleCase(i.reported_by)} on {fmtDate(i.reported_at)}
                  </p>
                  {i.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] capitalize",
                      i.priority === "urgent"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i.priority}
                  </span>
                  {canEdit ? (
                    <SelectField
                      className="h-8 w-32 text-xs"
                      value={i.status}
                      onChange={(v) =>
                        update.mutate({
                          id: i.id,
                          patch: {
                            status: v ?? i.status,
                            resolved_at: v === "resolved" ? new Date().toISOString() : null,
                          },
                        })
                      }
                      options={MAINTENANCE_STATUSES.map((s) => ({
                        value: s,
                        label: titleCase(s.replace("_", " ")),
                      }))}
                      allowClear={false}
                    />
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {i.status.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {open && <MaintenanceDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}

function MaintenanceDrawer({ onClose }: { onClose: () => void }) {
  const create = useCreateMaintenanceIssue();
  const { data: managed = [] } = useManagedProperties();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [reportedBy, setReportedBy] = useState("tenant");

  return (
    <DrawerShell open onOpenChange={(v) => !v && onClose()} ariaLabel="Log maintenance issue">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Log Maintenance Issue</h3>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        className="flex-1 space-y-3 overflow-y-auto p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!propertyId) return toast.error("Select a property");
          if (!title.trim()) return toast.error("Title is required");
          try {
            await create.mutateAsync({
              property_id: propertyId,
              title: title.trim(),
              description: description || null,
              category,
              priority,
              reported_by: reportedBy,
              status: "open",
            });
            toast.success("Issue logged");
            onClose();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Property *
          </span>
          <SearchableSelectField
            value={propertyId}
            onChange={setPropertyId}
            options={managed.map((p: any) => ({ value: p.id, label: p.title }))}
            placeholder="Select property"
            searchPlaceholder="Search..."
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Title *
          </span>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </span>
          <textarea
            className={cn(inputCls, "h-20 py-2")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Category
          </span>
          <SelectField
            value={category}
            onChange={(v) => setCategory(v ?? "general")}
            options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Priority
          </span>
          <SelectField
            value={priority}
            onChange={(v) => setPriority(v ?? "normal")}
            options={MAINTENANCE_PRIORITIES.map((p) => ({ value: p, label: titleCase(p) }))}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reported by
          </span>
          <SelectField
            value={reportedBy}
            onChange={(v) => setReportedBy(v ?? "tenant")}
            options={MAINTENANCE_REPORTED_BY.map((r) => ({ value: r, label: titleCase(r) }))}
            allowClear={false}
          />
        </label>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

/* ------------------------------------------------------------------------ */
/* Documents                                                                 */
/* ------------------------------------------------------------------------ */

function DocumentsTab() {
  const { data: managed = [] } = useManagedProperties();
  const { data: allDocs = [] } = useUploads({ category: "tenant_documents" });
  const { data: propertyDocs = [] } = useUploads({ category: "property_documents" });
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const { can } = usePermissions();

  const scopedPropertyDocs = propertyId
    ? propertyDocs.filter((d) => d.property_id === propertyId)
    : propertyDocs;

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="text-sm font-semibold">Property documents</h4>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <SearchableSelectField
            value={propertyId}
            onChange={setPropertyId}
            options={managed.map((p: any) => ({ value: p.id, label: p.title }))}
            placeholder="Filter by property"
            searchPlaceholder="Search properties..."
          />
        </div>
        <div className="mt-3">
          <DocumentList documents={scopedPropertyDocs} />
        </div>
        {can("properties", "edit") && propertyId && (
          <div className="mt-3">
            <UploadDropzone
              title="Upload a property document"
              categoryKey="property_documents"
              propertyId={propertyId}
            />
          </div>
        )}
      </Card>

      <Card>
        <h4 className="text-sm font-semibold">Tenant & tenancy documents</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Open a tenant from the Tenants tab, or a tenancy from the Tenancies tab, to upload against
          that record.
        </p>
        <div className="mt-3">
          <DocumentList documents={allDocs} />
        </div>
      </Card>
    </div>
  );
}

function DocumentList({
  documents,
}: {
  documents: {
    id: string;
    filename: string;
    file_size: number | null;
    created_at: string;
    storage_bucket: string;
    storage_path: string;
    mime_type: string | null;
  }[];
}) {
  if (documents.length === 0)
    return <p className="text-xs text-muted-foreground">No documents yet.</p>;
  return (
    <div className="space-y-1.5">
      {documents.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-2 truncate">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{d.filename}</span>
            <span className="shrink-0 text-muted-foreground">{fmtSize(d.file_size)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <span>{fmtDateTime(d.created_at)}</span>
            <button
              className="font-medium text-foreground hover:underline"
              onClick={() =>
                downloadUpload(d as any).catch((e) => toast.error((e as Error).message))
              }
            >
              Download
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
