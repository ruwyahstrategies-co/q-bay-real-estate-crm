import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Building, Trash2, Pencil, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import {
  useDevelopments,
  useDeleteDevelopment,
  useUpdateDevelopment,
} from "@/hooks/use-developments";
import { DevelopmentDrawer } from "@/components/development-drawer";
import type { Development } from "@/lib/db";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developments/")({
  head: () => ({ meta: [{ title: "Developments" }] }),
  component: DevelopmentsPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function DevelopmentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Development | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Development | null>(null);
  const { data: developments = [] } = useDevelopments({ search });
  const del = useDeleteDevelopment();
  const update = useUpdateDevelopment();
  const { can } = usePermissions();
  const canCreate = can("developments", "create");
  const canEdit = can("developments", "edit");
  const canDelete = can("developments", "delete");
  const canPublish = can("developments", "publish") || canEdit;

  return (
    <AppShell>
      <PermissionGate module="developments" action="view" page>
      <PageHeader
        eyebrow="Inventory"
        title="Developments"
        description="Off-plan and completed developments, linked to properties and enquiries."
        actions={canCreate ? <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> Add Development</Button> : undefined}
      />
      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search developments..." className={cn(inputCls, "w-full max-w-xs")} />
      </div>
      <DataTable
        columns={["Development", "Developer", "Location", "Price from", "Status", "Published", "Actions"]}
        empty={<EmptyState icon={<Building className="h-4 w-4" />} title="No developments yet" description="Add a development to link properties and track enquiries." />}
      >
        {developments.map((d) => (
          <tr
            key={d.id}
            role="link"
            tabIndex={0}
            aria-label={`Open ${d.name}`}
            className="cursor-pointer border-b border-border last:border-0 hover:bg-background/60 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button,a")) return;
              navigate({ to: "/developments/$developmentId", params: { developmentId: d.id } });
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate({ to: "/developments/$developmentId", params: { developmentId: d.id } });
              }
            }}
          >
            <td className="px-4 py-3 text-sm font-medium">
              <Link to="/developments/$developmentId" params={{ developmentId: d.id }} className="hover:underline">{d.name}</Link>
            </td>
            <td className="px-4 py-3 text-xs">{d.developer ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{[d.area_id, d.country_id].filter(Boolean).length ? "-" : "-"}</td>
            <td className="px-4 py-3 text-xs">{fmtMoney(d.price_from, d.currency)}</td>
            <td className="px-4 py-3 text-xs capitalize">{d.status ?? "-"}</td>
            <td className="px-4 py-3 text-xs">
              <button
                disabled={!canPublish}
                onClick={() => update.mutate({ id: d.id, patch: { is_published: !d.is_published } })}
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", d.is_published ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
              >
                {d.is_published ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {d.is_published ? "Published" : "Draft"}
              </button>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1">
                {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(d); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                {canDelete && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(d)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <DevelopmentDrawer open={open} onOpenChange={setOpen} development={edit} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete development?"
        description={`Delete ${confirmDelete?.name}? Linked properties keep their record but lose the development link.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Development deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}
