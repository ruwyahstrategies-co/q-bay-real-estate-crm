import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Contact2, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { usePermissions } from "@/hooks/use-auth";
import { useOwners, useCreateOwner, useUpdateOwner, useDeleteOwner, useOwnerProperties } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { SearchableSelectField } from "@/components/select-field";
import type { Owner } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/owners")({
  head: () => ({ meta: [{ title: "Owners" }] }),
  component: OwnersPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function OwnersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Owner | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Owner | null>(null);
  const { data: owners = [] } = useOwners(search);
  const del = useDeleteOwner();
  const { can } = usePermissions();
  const canCreate = can("owners", "create");
  const canEdit = can("owners", "edit");
  const canDelete = can("owners", "delete");

  return (
    <AppShell>
      <PermissionGate module="owners" action="view" page>
      <PageHeader
        eyebrow="Inventory"
        title="Owners"
        description="Property and development owners linked to your inventory."
        actions={canCreate ? <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> Add Owner</Button> : undefined}
      />
      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owners..." className={cn(inputCls, "w-full max-w-xs")} />
      </div>
      <DataTable
        columns={["Code", "Name", "Type", "Company", "Phone", "Email", "Actions"]}
        empty={<EmptyState icon={<Contact2 className="h-4 w-4" />} title="No owners yet" description="Add a property or development owner." />}
      >
        {owners.map((o) => (
          <OwnerRow key={o.id} owner={o} canEdit={canEdit} canDelete={canDelete} onEdit={() => { setEdit(o); setOpen(true); }} onDelete={() => setConfirmDelete(o)} />
        ))}
      </DataTable>

      <OwnerDrawer open={open} onOpenChange={setOpen} owner={edit} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete owner?"
        description={`Delete ${confirmDelete?.name}? Linked properties/developments will keep their owner_id cleared.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Owner deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}

function OwnerRow({ owner, canEdit, canDelete, onEdit, onDelete }: { owner: Owner; canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  const { data: properties = [] } = useOwnerProperties(owner.id);
  return (
    <tr className="border-b border-border last:border-0 hover:bg-background/60">
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{owner.code ?? "-"}</td>
      <td className="px-4 py-3 text-sm font-medium">
        <Link to="/owners/$ownerId" params={{ ownerId: owner.id }} className="hover:underline">{owner.name}</Link>
        {properties.length > 0 && <span className="ml-2 text-xs text-muted-foreground">({properties.length} propert{properties.length === 1 ? "y" : "ies"})</span>}
      </td>
      <td className="px-4 py-3 text-xs">{owner.is_developer ? "Developer" : "Individual"}</td>
      <td className="px-4 py-3 text-xs">{owner.company ?? "-"}</td>
      <td className="px-4 py-3 text-xs">{owner.phone ?? "-"}</td>
      <td className="px-4 py-3 text-xs">{owner.email ?? "-"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></button>}
          {canDelete && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      </td>
    </tr>
  );
}

function OwnerDrawer({ open, onOpenChange, owner }: { open: boolean; onOpenChange: (v: boolean) => void; owner?: Owner | null }) {
  const create = useCreateOwner();
  const update = useUpdateOwner();
  const isEdit = !!owner?.id;
  const { data: team = [] } = useTeamMembers();
  const [name, setName] = useState(owner?.name ?? "");
  const [company, setCompany] = useState(owner?.company ?? "");
  const [phone, setPhone] = useState(owner?.phone ?? "");
  const [email, setEmail] = useState(owner?.email ?? "");
  const [address, setAddress] = useState(owner?.address ?? "");
  const [isDeveloper, setIsDeveloper] = useState(owner?.is_developer ?? false);
  const [assignedAgentId, setAssignedAgentId] = useState(owner?.assigned_agent_id ?? "");
  const [notes, setNotes] = useState(owner?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setName(owner?.name ?? "");
    setCompany(owner?.company ?? "");
    setPhone(owner?.phone ?? "");
    setEmail(owner?.email ?? "");
    setAddress(owner?.address ?? "");
    setIsDeveloper(owner?.is_developer ?? false);
    setAssignedAgentId(owner?.assigned_agent_id ?? "");
    setNotes(owner?.notes ?? "");
  }, [open, owner?.id]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    const payload = {
      name: name.trim(),
      company: company || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      is_developer: isDeveloper,
      assigned_agent_id: assignedAgentId || null,
      notes: notes || null,
    };
    try {
      if (isEdit && owner) { await update.mutateAsync({ id: owner.id, patch: payload }); toast.success("Owner updated"); }
      else { await create.mutateAsync(payload); toast.success("Owner added"); }
      onOpenChange(false);
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit owner" : "Add owner"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Owner" : "Add Owner"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form className="flex-1 space-y-3 overflow-y-auto p-5" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name *</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Company</span>
          <input className={inputCls} value={company ?? ""} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</span>
          <input className={inputCls} value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</span>
          <input className={inputCls} type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Address</span>
          <input className={inputCls} value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned agent</span>
          <SearchableSelectField value={assignedAgentId} onChange={(v) => setAssignedAgentId(v ?? "")} options={team.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Select agent" searchPlaceholder="Search agents..." />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={isDeveloper} onChange={(e) => setIsDeveloper(e.target.checked)} />
          This owner is a developer company
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
          <textarea className={cn(inputCls, "h-24 py-2")} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
