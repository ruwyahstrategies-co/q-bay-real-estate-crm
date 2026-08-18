import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, LayoutGrid, Rows3, Building2, Pencil, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { PropertyDrawer } from "@/components/property-drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useProperties, useArchiveProperty, useDeleteProperty, usePropertyThumbnails } from "@/hooks/use-properties";
import { fmtMoney, type Property } from "@/lib/db";

export const Route = createFileRoute("/properties/")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"table" | "grid">("table");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Property | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Property | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Property | null>(null);
  const { data: properties = [], isLoading } = useProperties({ search, type });
  const { data: thumbnails = {} } = usePropertyThumbnails(properties.map((p) => p.id));
  const archive = useArchiveProperty();
  const del = useDeleteProperty();
  const { can } = usePermissions();
  const canCreate = can("properties", "create");
  const canEdit = can("properties", "edit");
  const canDelete = can("properties", "delete");

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
      <PageHeader
        eyebrow="Inventory"
        title="Properties"
        description="Centralised property inventory for matching with buyer intent."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add Property
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2">
        <input
          type="text"
          placeholder="Search by title, reference, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 flex-1 min-w-[200px] rounded-lg bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select value={type ?? ""} onChange={(e) => setType(e.target.value || null)} className="h-9 rounded-lg border border-border bg-canvas px-3 text-xs">
          <option value="">All types</option>
          <option>Apartment</option>
          <option>Villa</option>
          <option>Townhouse</option>
          <option>Penthouse</option>
          <option>Plot</option>
          <option>Commercial</option>
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "table" && "bg-canvas")} onClick={() => setView("table")} aria-label="Table view">
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "grid" && "bg-canvas")} onClick={() => setView("grid")} aria-label="Grid view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <DataTable
          columns={["Property", "Reference", "Type", "Location", "Developer", "Price", "Beds", "Size", "Availability", "Actions"]}
          empty={
            isLoading ? <EmptyState title="Loading…" /> :
            <EmptyState icon={<Building2 className="h-4 w-4" />} title="No properties yet" description="Add a property to build your inventory." />
          }
        >
          {properties.length > 0 ? properties.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-background/60">
              <td className="px-4 py-3 text-sm font-medium">
                <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="flex items-center gap-3 hover:underline">
                  <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {thumbnails[p.id] ? (
                      <img src={thumbnails[p.id]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /></span>
                    )}
                  </span>
                  {p.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-xs">{p.reference_code ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{p.property_type ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{p.location ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{p.developer ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{fmtMoney(p.price, p.currency)}</td>
              <td className="px-4 py-3 text-xs">{p.bedrooms ?? "—"}</td>
              <td className="px-4 py-3 text-xs">{p.size ? `${p.size} ${p.size_unit ?? ""}` : "—"}</td>
              <td className="px-4 py-3 text-xs capitalize">{p.availability}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(p); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                  {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setConfirmArchive(p)}><Archive className="h-3.5 w-3.5" /></button>}
                  {canDelete && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(p)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </td>
            </tr>
          )) : null}
        </DataTable>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {properties.length === 0 ? (
            <div className="col-span-full">
              <EmptyState icon={<Building2 className="h-4 w-4" />} title="No properties yet" />
            </div>
          ) : properties.map((p) => (
            <Link key={p.id} to="/properties/$propertyId" params={{ propertyId: p.id }} className="overflow-hidden rounded-2xl border border-border bg-canvas hover:shadow-md transition">
              <div className="aspect-video w-full bg-muted">
                {thumbnails[p.id] ? (
                  <img src={thumbnails[p.id]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center"><Building2 className="h-5 w-5 text-muted-foreground" /></span>
                )}
              </div>
              <div className="p-5">
                <h4 className="text-sm font-semibold">{p.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{p.location ?? "—"}</p>
                <p className="mt-3 text-base font-semibold">{fmtMoney(p.price, p.currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.property_type ?? "—"} · {p.bedrooms ?? "?"} bed · {p.size ?? "?"} {p.size_unit ?? ""}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <PropertyDrawer
        open={open}
        onOpenChange={setOpen}
        property={edit}
        onSaved={(saved, wasNew) => {
          if (wasNew) navigate({ to: "/properties/$propertyId", params: { propertyId: saved.id } });
        }}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        title="Archive property?"
        description={`Archive ${confirmArchive?.title}?`}
        confirmLabel="Archive"
        pending={archive.isPending}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={async () => {
          if (!confirmArchive) return;
          try { await archive.mutateAsync(confirmArchive.id); toast.success("Property archived"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmArchive(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Permanently delete property?"
        description={`Delete ${confirmDelete?.title}. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Property deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}
