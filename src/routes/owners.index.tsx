import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Contact2, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { DataTable, dataRowCls } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { MasterSelectField } from "@/components/master-select-field";
import { useMasterData } from "@/hooks/use-master-data";
import { initialMasterSelection, resolveMasterSelection } from "@/lib/master-data";
import { usePermissions } from "@/hooks/use-auth";
import {
  useOwners,
  useCreateOwner,
  useUpdateOwner,
  useDeleteOwner,
  useOwnerProperties,
} from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { useDebounced } from "@/hooks/use-debounced";
import { useRowSelection } from "@/hooks/use-row-selection";
import { SearchableSelectField } from "@/components/select-field";
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton } from "@/components/filter-toolbar";
import { StaffAvatar } from "@/components/staff-avatar";
import { buildMasterFilterOptions } from "@/lib/master-data";
import { OWNER_PHONE_HIDDEN_LABEL, type SafeOwner } from "@/lib/owner-privacy";
import { normalizePhone, phoneError } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Owner = SafeOwner;

export const Route = createFileRoute("/owners/")({
  head: () => ({ meta: [{ title: "Owners" }] }),
  component: OwnersPage,
});

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function OwnersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [ownerType, setOwnerType] = useState<"individual" | "developer" | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Owner | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Owner | null>(null);
  const debouncedSearch = useDebounced(search, 250);
  // Type, Company and Assigned agent filter the matching owners columns in the database. The text
  // search stays the secure server-side search (phones only count where the viewer may see them),
  // and filter options never include phone or ID values.
  const { data: owners = [], isLoading } = useOwners({
    search: debouncedSearch,
    isDeveloper: ownerType === null ? null : ownerType === "developer",
    companyId,
    agentId,
  });
  const { data: companyValues = [] } = useMasterData("company");
  const { data: team = [] } = useTeamMembers();
  const companyOptions = useMemo(() => buildMasterFilterOptions(companyValues), [companyValues]);
  const agentOptions = useMemo(
    () => team.filter((m) => m.is_active).map((m) => ({ value: m.id, label: m.full_name })),
    [team],
  );
  const activeFilterCount =
    (search.trim() ? 1 : 0) + (ownerType ? 1 : 0) + (companyId ? 1 : 0) + (agentId ? 1 : 0);
  function clearFilters() {
    setSearch("");
    setOwnerType(null);
    setCompanyId(null);
    setAgentId(null);
  }
  const selection = useRowSelection(owners.map((o) => o.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selection.someSelected;
  }, [selection.someSelected]);
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
          actions={
            canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEdit(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Owner
              </Button>
            ) : undefined
          }
        />
        <FilterToolbar ariaLabel="Owner filters" className="mb-2" activeCount={activeFilterCount}>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Search by name, company, email or phone number..."
          />
          <FilterSelect
            label="Owner type"
            value={ownerType}
            onChange={(v) => setOwnerType(v as "individual" | "developer" | null)}
            options={[
              { value: "individual", label: "Individual" },
              { value: "developer", label: "Developer" },
            ]}
            allLabel="All types"
          />
          <FilterSelect
            label="Company"
            value={companyId}
            onChange={setCompanyId}
            options={companyOptions}
            allLabel="All companies"
            searchable
          />
          <FilterSelect
            label="Assigned agent"
            value={agentId}
            onChange={setAgentId}
            options={agentOptions}
            allLabel="All agents"
            searchable
          />
          <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />
        </FilterToolbar>
        <p className="mb-3 text-[11px] text-muted-foreground" aria-live="polite">
          {isLoading ? "Loading..." : `${owners.length} ${owners.length === 1 ? "owner" : "owners"}${activeFilterCount ? " match the filters" : ""}. `}
          Phone numbers are searchable only for owners whose phone you are allowed to see.
        </p>
        {selection.count > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-xs">
            <span>{selection.count} selected</span>
            <button className="ml-auto text-muted-foreground hover:underline" onClick={selection.clear}>
              Clear
            </button>
          </div>
        )}
        <DataTable
          leadingHeader={
            <input
              ref={selectAllRef}
              type="checkbox"
              aria-label="Select all owners"
              checked={selection.allSelected}
              disabled={owners.length === 0}
              onChange={(e) => selection.toggleAll(e.target.checked)}
            />
          }
          columns={["Code", "Name", "Type", "Company", "Agent", "Phone", "Email", "Actions"]}
          empty={
            <EmptyState
              icon={<Contact2 className="h-4 w-4" />}
              title={activeFilterCount ? "No owners match these filters" : "No owners yet"}
              description={activeFilterCount ? "Try removing a filter." : "Add a property or development owner."}
              action={
                activeFilterCount ? (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        >
          {owners.map((o) => (
            <OwnerRow
              key={o.id}
              owner={o}
              agent={team.find((m) => m.id === o.assigned_agent_id) ?? null}
              selected={selection.selected.has(o.id)}
              onSelectedChange={(checked) => selection.toggle(o.id, checked)}
              canEdit={canEdit}
              canDelete={canDelete}
              onOpen={() =>
                navigate({ to: "/owners/$ownerId", params: { ownerId: o.id } })
              }
              onEdit={() => {
                setEdit(o);
                setOpen(true);
              }}
              onDelete={() => setConfirmDelete(o)}
            />
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
            try {
              await del.mutateAsync(confirmDelete.id);
              toast.success("Owner deleted");
            } catch (e) {
              toast.error((e as Error).message);
            }
            setConfirmDelete(null);
          }}
        />
      </PermissionGate>
    </AppShell>
  );
}

function OwnerRow({
  owner,
  agent,
  selected,
  onSelectedChange,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
}: {
  owner: Owner;
  agent: { full_name: string; avatar_url: string | null } | null;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: properties = [] } = useOwnerProperties(owner.id);
  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`Open ${owner.name}`}
      className={cn(dataRowCls, "cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,label")) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${owner.name}`}
          checked={selected}
          onChange={(e) => onSelectedChange(e.target.checked)}
        />
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{owner.code ?? "-"}</td>
      <td className="px-4 py-3 text-sm font-medium">
        <Link to="/owners/$ownerId" params={{ ownerId: owner.id }} className="hover:underline">
          {owner.name}
        </Link>
        {properties.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({properties.length} propert{properties.length === 1 ? "y" : "ies"})
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs">{owner.is_developer ? "Developer" : "Individual"}</td>
      <td className="px-4 py-3 text-xs">{owner.company ?? "-"}</td>
      <td className="px-4 py-3 text-xs">
        {agent ? (
          <span className="inline-flex items-center gap-2">
            <StaffAvatar name={agent.full_name} url={agent.avatar_url} size="xs" />
            <span className="max-w-[110px] truncate">{agent.full_name}</span>
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {owner.phone_hidden ? (
          <span
            className="text-muted-foreground"
            title="Only the owner's agent and administrators can see this number"
          >
            {OWNER_PHONE_HIDDEN_LABEL}
          </span>
        ) : (
          (owner.phone ?? "-")
        )}
      </td>
      <td className="px-4 py-3 text-xs">{owner.email ?? "-"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {canEdit && (
            <button className="rounded-md p-1.5 hover:bg-muted" title="Edit" aria-label={`Edit ${owner.name}`} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button className="rounded-md p-1.5 hover:bg-muted text-destructive" title="Delete" aria-label={`Delete ${owner.name}`} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function OwnerDrawer({
  open,
  onOpenChange,
  owner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  owner?: Owner | null;
}) {
  const create = useCreateOwner();
  const update = useUpdateOwner();
  const isEdit = !!owner?.id;
  const { data: team = [] } = useTeamMembers();
  const [name, setName] = useState(owner?.name ?? "");
  const { data: companyValues = [] } = useMasterData("company");
  const [company, setCompany] = useState(
    initialMasterSelection({ id: owner?.company_id, text: owner?.company }),
  );
  const [phone, setPhone] = useState(owner?.phone ?? "");
  const [email, setEmail] = useState(owner?.email ?? "");
  const [address, setAddress] = useState(owner?.address ?? "");
  const [idNumber, setIdNumber] = useState(owner?.id_number ?? "");
  const [isDeveloper, setIsDeveloper] = useState(owner?.is_developer ?? false);
  const [assignedAgentId, setAssignedAgentId] = useState(owner?.assigned_agent_id ?? "");
  const [notes, setNotes] = useState(owner?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setName(owner?.name ?? "");
    setCompany(initialMasterSelection({ id: owner?.company_id, text: owner?.company }));
    setPhone(owner?.phone ?? "");
    setEmail(owner?.email ?? "");
    setAddress(owner?.address ?? "");
    setIdNumber(owner?.id_number ?? "");
    setIsDeveloper(owner?.is_developer ?? false);
    setAssignedAgentId(owner?.assigned_agent_id ?? "");
    setNotes(owner?.notes ?? "");
  }, [open, owner?.id]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    const phoneHidden = isEdit && !!owner?.phone_hidden;
    // A hidden phone is never sent back: leaving the field untouched must not wipe it.
    // Legacy owners saved without a phone can still be edited; a phone is required for new
    // owners, and for any owner that has one or where the user types one.
    if (!phoneHidden && (!isEdit || normalizePhone(phone) || normalizePhone(owner?.phone))) {
      const err = phoneError(phone);
      if (err) return toast.error(err);
    }
    const payload = {
      name: name.trim(),
      ...(() => {
        const sel = resolveMasterSelection(company, companyValues, owner?.company);
        return { company_id: sel.id, company: sel.text };
      })(),
      ...(phoneHidden ? {} : { phone: normalizePhone(phone) || null }),
      email: email || null,
      address: address || null,
      ...(isEdit && owner?.id_number_hidden ? {} : { id_number: idNumber || null }),
      is_developer: isDeveloper,
      assigned_agent_id: assignedAgentId || null,
      notes: notes || null,
    };
    try {
      if (isEdit && owner) {
        await update.mutateAsync({ id: owner.id, patch: payload });
        toast.success("Owner updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Owner added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel={isEdit ? "Edit owner" : "Add owner"}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Owner" : "Add Owner"}</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="flex-1 space-y-3 overflow-y-auto p-5" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Name *
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
            Company
          </span>
          <MasterSelectField
            kind="company"
            value={company}
            onChange={setCompany}
            current={{ id: owner?.company_id, text: owner?.company }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Phone *
          </span>
          {isEdit && owner?.phone_hidden ? (
            <input
              className={cn(inputCls, "text-muted-foreground")}
              value={OWNER_PHONE_HIDDEN_LABEL}
              disabled
              readOnly
              aria-label="Phone number hidden"
            />
          ) : (
            <input
              className={inputCls}
              type="tel"
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </span>
          <input
            className={inputCls}
            type="email"
            value={email ?? ""}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Address
          </span>
          <input
            className={inputCls}
            value={address ?? ""}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            ID number
          </span>
          {isEdit && owner?.id_number_hidden ? (
            <input
              className={cn(inputCls, "text-muted-foreground")}
              value={OWNER_PHONE_HIDDEN_LABEL}
              disabled
              readOnly
              aria-label="ID number hidden"
            />
          ) : (
            <input
              className={inputCls}
              value={idNumber ?? ""}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Assigned agent
          </span>
          <SearchableSelectField
            value={assignedAgentId}
            onChange={(v) => setAssignedAgentId(v ?? "")}
            options={team.map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select agent"
            searchPlaceholder="Search agents..."
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isDeveloper}
            onChange={(e) => setIsDeveloper(e.target.checked)}
          />
          This owner is a developer company
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </span>
          <textarea
            className={cn(inputCls, "h-24 py-2")}
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-end gap-2 sticky bottom-0 z-10 -mx-5 -mb-5 border-t border-border bg-canvas/95 px-5 py-3 backdrop-blur">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}
