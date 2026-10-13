import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Building, Trash2, Pencil, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable, dataRowCls } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton } from "@/components/filter-toolbar";
import { LocationFilterSelects } from "@/components/location-filter";
import { EMPTY_LOCATION_FILTER, type LocationFilterValue } from "@/lib/location-filter";
import { StatusBadge } from "@/components/status-badge";
import { StaffAvatar } from "@/components/staff-avatar";
import { usePermissions } from "@/hooks/use-auth";
import {
  useDevelopments,
  useDeleteDevelopment,
  useUpdateDevelopment,
  developmentStatusLabel,
  DEVELOPMENT_STATUS_OPTIONS,
} from "@/hooks/use-developments";
import { useMasterData } from "@/hooks/use-master-data";
import { useOwnerOptions } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { useLocationLabel } from "@/hooks/use-locations";
import { buildMasterFilterOptions } from "@/lib/master-data";
import { DevelopmentDrawer } from "@/components/development-drawer";
import type { Development } from "@/lib/db";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developments/")({
  head: () => ({ meta: [{ title: "Developments" }] }),
  component: DevelopmentsPage,
});

const STATUS_VARIANT = {
  off_plan: "orange",
  under_construction: "amber",
  ready: "green",
} as const;

function DevelopmentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [published, setPublished] = useState<"published" | "draft" | null>(null);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Development | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Development | null>(null);

  // Every filter below is applied by the database (see useDevelopments) and is part of its query key.
  const { data: developments = [], isLoading } = useDevelopments({
    search,
    developerId,
    ownerId,
    status,
    countryId: location.countryId,
    areaId: location.areaId,
    placeId: location.placeId,
    agentId,
    published,
  });
  const { data: developerValues = [] } = useMasterData("developer");
  const { data: owners = [] } = useOwnerOptions();
  const { data: team = [] } = useTeamMembers();
  const locationLabel = useLocationLabel();
  const del = useDeleteDevelopment();
  const update = useUpdateDevelopment();
  const { can } = usePermissions();
  const canCreate = can("developments", "create");
  const canEdit = can("developments", "edit");
  const canDelete = can("developments", "delete");
  const canPublish = can("developments", "publish") || canEdit;

  const developerOptions = useMemo(() => buildMasterFilterOptions(developerValues), [developerValues]);
  const ownerOptions = useMemo(
    () => owners.map((o) => ({ value: o.id, label: o.company ? `${o.name} (${o.company})` : o.name })),
    [owners],
  );
  const agentOptions = useMemo(
    () => team.filter((m) => m.is_active).map((m) => ({ value: m.id, label: m.full_name })),
    [team],
  );
  const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.name ?? "-";

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (developerId ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (status ? 1 : 0) +
    (location.countryId ? 1 : 0) +
    (location.areaId ? 1 : 0) +
    (location.placeId ? 1 : 0) +
    (agentId ? 1 : 0) +
    (published ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setDeveloperId(null);
    setOwnerId(null);
    setStatus(null);
    setLocation(EMPTY_LOCATION_FILTER);
    setAgentId(null);
    setPublished(null);
  }

  return (
    <AppShell>
      <PermissionGate module="developments" action="view" page>
        <PageHeader
          eyebrow="Inventory"
          title="Developments"
          description="Off-plan and completed developments, linked to properties and enquiries."
          actions={
            canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEdit(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Development
              </Button>
            ) : undefined
          }
        />

        <FilterToolbar ariaLabel="Development filters">
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Search development or developer name..."
            className="basis-full lg:basis-auto"
          />
          <FilterSelect
            label="Developer"
            value={developerId}
            onChange={setDeveloperId}
            options={developerOptions}
            allLabel="All developers"
            searchable
          />
          <FilterSelect
            label="Owner"
            value={ownerId}
            onChange={setOwnerId}
            options={ownerOptions}
            allLabel="All owners"
            searchable
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={DEVELOPMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            allLabel="All statuses"
          />
          <LocationFilterSelects value={location} onChange={setLocation} />
          <FilterSelect
            label="Assigned agent"
            value={agentId}
            onChange={setAgentId}
            options={agentOptions}
            allLabel="All agents"
            searchable
          />
          <FilterSelect
            label="Publication"
            value={published}
            onChange={(v) => setPublished(v as "published" | "draft" | null)}
            options={[
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
            ]}
            allLabel="Published and draft"
          />
          <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />
        </FilterToolbar>

        <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
          {isLoading ? "Loading..." : `${developments.length} ${developments.length === 1 ? "development" : "developments"}${activeFilterCount ? " match the filters" : ""}`}
        </p>

        <DataTable
          columns={["Development", "Developer", "Owner", "Location", "Price from", "Status", "Agent", "Published", "Actions"]}
          empty={
            <EmptyState
              icon={<Building className="h-4 w-4" />}
              title={activeFilterCount ? "No developments match these filters" : "No developments yet"}
              description={
                activeFilterCount
                  ? "Try removing a filter."
                  : "Add a development to link properties and track enquiries."
              }
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
          {developments.map((d) => {
            const agent = team.find((m) => m.id === d.assigned_agent_id);
            return (
              <tr
                key={d.id}
                role="link"
                tabIndex={0}
                aria-label={`Open ${d.name}`}
                className={cn(dataRowCls, "cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40")}
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
                  <Link to="/developments/$developmentId" params={{ developmentId: d.id }} className="hover:underline">
                    {d.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs">{d.developer ?? "-"}</td>
                <td className="px-4 py-3 text-xs">{ownerName(d.owner_id)}</td>
                <td className="px-4 py-3 text-xs">{locationLabel(d) || "-"}</td>
                <td className="px-4 py-3 text-xs tabular-nums">{fmtMoney(d.price_from, d.currency)}</td>
                <td className="px-4 py-3 text-xs">
                  {d.status ? (
                    <StatusBadge variant={STATUS_VARIANT[d.status as keyof typeof STATUS_VARIANT] ?? "neutral"}>
                      {developmentStatusLabel(d.status)}
                    </StatusBadge>
                  ) : (
                    "-"
                  )}
                </td>
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
                  <button
                    disabled={!canPublish}
                    aria-label={d.is_published ? `Unpublish ${d.name}` : `Publish ${d.name}`}
                    onClick={() => update.mutate({ id: d.id, patch: { is_published: !d.is_published } })}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium disabled:cursor-default",
                      d.is_published ? "bg-pastel-green" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {d.is_published ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {d.is_published ? "Published" : "Draft"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button
                        className="rounded-md p-1.5 hover:bg-muted"
                        title="Edit"
                        aria-label={`Edit ${d.name}`}
                        onClick={() => {
                          setEdit(d);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        className="rounded-md p-1.5 text-destructive hover:bg-muted"
                        title="Delete"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => setConfirmDelete(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
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
            try {
              await del.mutateAsync(confirmDelete.id);
              toast.success("Development deleted");
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
