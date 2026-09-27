import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { DocumentList } from "./document-list";
import { UploadDropzone } from "./upload-dropzone";
import { usePermissions } from "@/hooks/use-auth";
import {
  useCreateTenant,
  useTenancies,
  useTenant,
  useTenantIdNumber,
  useUpdateTenant,
} from "@/hooks/use-property-management";
import { useUploads } from "@/hooks/use-uploads";
import { fmtDate, fmtMoney } from "@/lib/db";
import { normalizePhone, phoneError } from "@/lib/phone";
import type { TenantRecord } from "@/lib/tenant-privacy";
import { cn, titleCase } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Add a tenant. Phone is required for every new tenant, like leads and owners. */
export function TenantDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the new tenant, for example to select it in a tenancy form. */
  onCreated?: (tenant: TenantRecord) => void;
}) {
  const create = useCreateTenant();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [nationality, setNationality] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setIdNumber("");
    setNationality("");
    setNotes("");
  }, [open]);

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
          const problem = phoneError(phone);
          if (problem) return toast.error(problem);
          try {
            const tenant = await create.mutateAsync({
              full_name: name.trim(),
              phone: normalizePhone(phone),
              email: email.trim() || null,
              id_number: idNumber.trim() || null,
              nationality: nationality.trim() || null,
              notes: notes.trim() || null,
            });
            toast.success("Tenant added");
            onCreated?.(tenant);
            onOpenChange(false);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <Field label="Full name *">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Phone number *">
          <input
            className={inputCls}
            type="tel"
            placeholder="+974..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="ID / passport number"
          hint="Only administrators, you, and the agent of the property they rent can see this later."
        >
          <input
            className={inputCls}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </Field>
        <Field label="Nationality">
          <input
            className={inputCls}
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={cn(inputCls, "h-20 py-2")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
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

/** Tenant profile: editable contact and identity fields, tenancy history and documents. */
export function TenantDetailDrawer({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const { data: tenant } = useTenant(tenantId);
  const { data: idInfo } = useTenantIdNumber(tenantId);
  const { data: tenancies = [] } = useTenancies();
  const { data: documents = [] } = useUploads({ tenantId });
  const update = useUpdateTenant();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (tenant) {
      setName(tenant.full_name);
      setPhone(tenant.phone ?? "");
      setEmail(tenant.email ?? "");
      setNationality(tenant.nationality ?? "");
      setNotes(tenant.notes ?? "");
    }
  }, [tenant]);
  useEffect(() => {
    setIdNumber(idInfo?.value ?? "");
  }, [idInfo]);

  const history = tenancies.filter((t) => t.tenant_id === tenantId);
  const idVisible = !!idInfo?.visible;
  const hadPhone = !!normalizePhone(tenant?.phone);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    // A tenant saved before phone became mandatory can still be edited without one, but a phone
    // that exists can not be removed and anything typed must be a real number.
    if (hadPhone || normalizePhone(phone)) {
      const problem = phoneError(phone);
      if (problem) return toast.error(problem);
    }
    const patch: Parameters<typeof update.mutateAsync>[0]["patch"] = {
      full_name: name.trim(),
      phone: normalizePhone(phone) || null,
      email: email.trim() || null,
      nationality: nationality.trim() || null,
      notes: notes.trim() || null,
    };
    // The ID number is only written by someone who is allowed to see it.
    if (idVisible && idNumber.trim() !== (idInfo?.value ?? ""))
      patch.id_number = idNumber.trim() || null;
    try {
      await update.mutateAsync({ id: tenantId, patch });
      toast.success("Tenant updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

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
          <form className="space-y-3" onSubmit={handleSave}>
            <Field label="Full name">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field
              label={hadPhone ? "Phone number *" : "Phone number"}
              hint={
                hadPhone
                  ? undefined
                  : "No phone number is on file for this tenant. Add one so the tenancy contact is complete."
              }
            >
              <input
                className={inputCls}
                type="tel"
                placeholder="+974..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field
              label="ID / passport number"
              hint={
                idVisible
                  ? undefined
                  : "Hidden. Only administrators, the person who added this tenant, and the agent of the property they rent can see it."
              }
            >
              <input
                className={inputCls}
                value={idVisible ? idNumber : "Hidden"}
                onChange={(e) => setIdNumber(e.target.value)}
                disabled={!canEdit || !idVisible}
              />
            </Field>
            <Field label="Nationality">
              <input
                className={inputCls}
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={cn(inputCls, "h-20 py-2")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
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
                    <p className="font-medium">
                      {h.properties?.title ?? "Property"}
                      {h.contract_number ? ` · ${h.contract_number}` : ""}
                    </p>
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
            <div className="mt-2">
              <DocumentList documents={documents} />
            </div>
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
