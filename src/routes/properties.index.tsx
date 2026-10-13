import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  LayoutGrid,
  Rows3,
  Building2,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Share2,
  Upload,
  Download,
  FileText,
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { DataTable, dataRowCls } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { PropertyDrawer } from "@/components/property-drawer";
import { PropertyImporter } from "@/components/property-importer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton } from "@/components/filter-toolbar";
import { StaffAvatar } from "@/components/staff-avatar";
import { AvailabilityRing, PurposeBadge } from "@/components/status-badge";
import { PropertyWebsiteLinkIcon } from "@/components/property-website-link";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { cn } from "@/lib/utils";
import {
  useProperties,
  useArchiveProperty,
  useRestoreProperty,
  useDeleteProperty,
  usePropertyThumbnails,
  usePropertyPurposeCounts,
  type PropertyPurposeTab,
} from "@/hooks/use-properties";
import { downloadCsv } from "@/lib/csv-export";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { openPropertyPdf, sharePropertyPdf } from "@/lib/property-pdf";
import {
  PROPERTY_AVAILABILITIES,
  PROPERTY_AVAILABILITY_LABELS,
  fmtMoney,
  isConfirmationOverdue,
  type Property,
} from "@/lib/db";

export const Route = createFileRoute("/properties/")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

const PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse", "Plot", "Commercial"];

function PropertiesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"table" | "grid">("table");
  const [purpose, setPurpose] = useState<PropertyPurposeTab>("sale");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Property | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["value"]>("active");
  const [availability, setAvailability] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Property | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Property | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  // Sale | Rent, the archive state, availability, type and search are independent filters; all of
  // them reach the database query (see applyPropertyFilters in use-properties).
  const { data: properties = [], isLoading } = useProperties({
    search,
    type,
    status: statusFilter,
    availability,
    purpose,
  });
  const { data: purposeCounts } = usePropertyPurposeCounts({
    search,
    type,
    status: statusFilter,
    availability,
  });
  const activeFilterCount =
    (search.trim() ? 1 : 0) + (type ? 1 : 0) + (availability ? 1 : 0) + (statusFilter !== "active" ? 1 : 0);
  function clearFilters() {
    setSearch("");
    setType(null);
    setAvailability(null);
    setStatusFilter("active");
  }
  const { data: thumbnails = {} } = usePropertyThumbnails(properties.map((p) => p.id));
  const { data: propertyFieldDefs = [] } = useFieldDefinitions("property", { activeOnly: true });
  const exportablePropertyFieldDefs = propertyFieldDefs.filter((d) => d.is_exportable);
  const { data: team = [] } = useTeamMembers();
  const archive = useArchiveProperty();
  const restore = useRestoreProperty();
  const del = useDeleteProperty();
  const { can } = usePermissions();
  const canCreate = can("properties", "create");
  const canEdit = can("properties", "edit");
  const canHardDelete = can("properties", "hard_delete");

  async function handleShare(p: Property) {
    const agent = team.find((m) => m.id === p.assigned_agent_id);
    try {
      const result = await sharePropertyPdf(
        p,
        thumbnails[p.id],
        agent ? { full_name: agent.full_name, email: agent.email, phone: agent.phone } : null,
      );
      if (result === "downloaded") toast.success("PDF downloaded - share it from your downloads");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
        <PageHeader
          eyebrow="Inventory"
          title="Properties"
          description="Sale and rental inventory, kept in one place for matching with buyer intent."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `properties-${new Date().toISOString().slice(0, 10)}.csv`,
                    properties,
                    [
                      { key: "title", label: "Title" },
                      { key: "reference_code", label: "Reference code" },
                      { key: "property_type", label: "Type" },
                      { key: "purpose", label: "Purpose" },
                      { key: "location", label: "Location" },
                      { key: "developer", label: "Developer" },
                      { key: "price", label: "Price" },
                      { key: "currency", label: "Currency" },
                      { key: "bedrooms", label: "Bedrooms" },
                      { key: "bathrooms", label: "Bathrooms" },
                      { key: "size", label: "Size" },
                      { key: "built_up_area", label: "Built-up area" },
                      { key: "built_up_area_unit", label: "Built-up area unit" },
                      { key: "availability", label: "Availability" },
                      { key: "status", label: "Status" },
                      { key: "is_published", label: "Published" },
                      ...exportablePropertyFieldDefs.map((d) => ({
                        key: d.key,
                        label: d.label,
                        get: (row: Property) =>
                          (row.custom_fields as Record<string, unknown> | null)?.[d.key],
                      })),
                    ],
                  )
                }
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={() => setImporterOpen(true)}>
                  <Upload className="h-3.5 w-3.5" /> Upload Properties
                </Button>
              )}
              {canCreate && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEdit(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Property
                </Button>
              )}
            </>
          }
        />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl<PropertyPurposeTab>
            ariaLabel="Listing purpose"
            tone="green"
            size="lg"
            value={purpose}
            onChange={setPurpose}
            options={[
              { value: "sale", label: "Sale", count: purposeCounts?.sale },
              { value: "rent", label: "Rent", count: purposeCounts?.rent },
            ]}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isLoading
              ? "Loading..."
              : `${properties.length} ${purpose === "sale" ? "sale" : "rental"} ${properties.length === 1 ? "property" : "properties"} shown`}
          </p>
        </div>

        <FilterToolbar ariaLabel="Property filters">
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Search by title, reference, location..."
          />
          <FilterSelect
            label="Type"
            value={type}
            onChange={setType}
            options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))}
            allLabel="All types"
          />
          <FilterSelect
            label="Availability"
            value={availability}
            onChange={setAvailability}
            options={[...PROPERTY_AVAILABILITIES, "needs_confirmation"].map((a) => ({
              value: a,
              label: PROPERTY_AVAILABILITY_LABELS[a] ?? a,
            }))}
            allLabel="All availability"
            className="w-48"
          />
          <SegmentedControl
            ariaLabel="Archive state"
            size="md"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
          <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />
          <SegmentedControl
            ariaLabel="View"
            size="md"
            className="ml-auto"
            value={view}
            onChange={setView}
            options={[
              { value: "table", ariaLabel: "Table view", icon: <Rows3 className="h-3.5 w-3.5" /> },
              { value: "grid", ariaLabel: "Grid view", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
            ]}
          />
        </FilterToolbar>

        {view === "table" ? (
          <DataTable
            columns={[
              "Property",
              "Reference",
              "Type",
              "Purpose",
              "Location",
              "Developer",
              "Price",
              "Beds",
              "Size",
              "Availability",
              "Actions",
            ]}
            empty={
              isLoading ? (
                <EmptyState title="Loading..." />
              ) : (
                <EmptyState
                  icon={<Building2 className="h-4 w-4" />}
                  title={activeFilterCount ? "No properties match these filters" : `No ${purpose === "sale" ? "sale" : "rental"} properties yet`}
                  description={activeFilterCount ? "Try removing a filter." : "Add a property to build your inventory."}
                  action={
                    activeFilterCount ? (
                      <Button size="sm" variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          >
            {properties.length > 0
              ? properties.map((p) => (
                  <tr key={p.id} className={dataRowCls}>
                    <td className="min-w-[200px] px-4 py-3 text-sm font-medium">
                      <Link
                        to="/properties/$propertyId"
                        params={{ propertyId: p.id }}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                          {thumbnails[p.id] ? (
                            <img
                              src={thumbnails[p.id]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          )}
                        </span>
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">{p.reference_code ?? "-"}</td>
                    <td className="px-4 py-3 text-xs">{p.property_type ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <PurposeBadge purpose={p.purpose} />
                    </td>
                    <td className="min-w-[150px] px-4 py-3 text-xs">{p.location ?? "-"}</td>
                    <td className="px-4 py-3 text-xs">{p.developer ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">{fmtMoney(p.price, p.currency)}</td>
                    <td className="px-4 py-3 text-xs">{p.bedrooms ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {p.size ? `${p.size} ${p.size_unit ?? ""}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <AvailabilityRing
                        availability={p.availability}
                        needsConfirmation={isConfirmationOverdue(p)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <PropertyWebsiteLinkIcon property={p} />
                        <button
                          className="rounded-md p-1.5 hover:bg-muted"
                          title="Download PDF"
                          onClick={() => openPropertyPdf(p, thumbnails[p.id])}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Edit"
                            aria-label={`Edit ${p.title}`}
                            onClick={() => {
                              setEdit(p);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && p.status !== "archived" && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Archive"
                            onClick={() => setConfirmArchive(p)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && p.status === "archived" && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Restore"
                            onClick={async () => {
                              try {
                                await restore.mutateAsync(p.id);
                                toast.success("Property restored. Confirm its availability before relisting.");
                              } catch (e) {
                                toast.error((e as Error).message);
                              }
                            }}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canHardDelete ? (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted text-destructive"
                            title="Delete permanently"
                            onClick={() => setConfirmDelete(p)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Share"
                            onClick={() => handleShare(p)}
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </DataTable>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {properties.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={<Building2 className="h-4 w-4" />}
                  title={activeFilterCount ? "No properties match these filters" : `No ${purpose === "sale" ? "sale" : "rental"} properties yet`}
                  action={
                    activeFilterCount ? (
                      <Button size="sm" variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              properties.map((p) => {
                const agent = team.find((m) => m.id === p.assigned_agent_id);
                const features = [
                  p.bedrooms != null ? { icon: BedDouble, text: `${p.bedrooms} bed` } : null,
                  p.bathrooms != null ? { icon: Bath, text: `${p.bathrooms} bath` } : null,
                  p.size ? { icon: Ruler, text: `${p.size} ${p.size_unit ?? ""}`.trim() } : null,
                ].filter((f): f is { icon: typeof BedDouble; text: string } => !!f);
                return (
                  <Link
                    key={p.id}
                    to="/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="group flex flex-col overflow-hidden rounded-xl border border-border bg-canvas shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      {thumbnails[p.id] ? (
                        <img
                          src={thumbnails[p.id]}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Building2 className="h-6 w-6 text-muted-foreground" />
                        </span>
                      )}
                      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                        <PurposeBadge purpose={p.purpose} className="shadow-card" />
                        {p.is_published && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                            <Globe className="h-3 w-3" /> Published
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-3 left-3 rounded-full bg-canvas/95 px-2.5 py-1 shadow-card">
                        <AvailabilityRing
                          availability={p.availability}
                          needsConfirmation={isConfirmationOverdue(p)}
                          labelClassName="text-[11px] font-medium"
                        />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-base font-semibold tabular-nums">{fmtMoney(p.price, p.currency)}</p>
                        {p.reference_code && (
                          <span className="font-mono text-[11px] text-muted-foreground">{p.reference_code}</span>
                        )}
                      </div>
                      <h4 className="mt-1 line-clamp-1 text-sm font-medium">{p.title}</h4>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{p.location ?? "-"}</span>
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {features.length === 0 ? (
                            <span>{p.property_type ?? "-"}</span>
                          ) : (
                            features.map((f) => (
                              <span key={f.text} className="inline-flex items-center gap-1">
                                <f.icon className="h-3.5 w-3.5" /> {f.text}
                              </span>
                            ))
                          )}
                        </div>
                        {agent && <StaffAvatar name={agent.full_name} url={agent.avatar_url} size="sm" />}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}

        <PropertyImporter open={importerOpen} onOpenChange={setImporterOpen} />
        <PropertyDrawer
          open={open}
          onOpenChange={setOpen}
          property={edit}
          onSaved={(saved, wasNew) => {
            if (wasNew)
              navigate({ to: "/properties/$propertyId", params: { propertyId: saved.id } });
          }}
        />
        <ConfirmDialog
          open={!!confirmArchive}
          title="Archive property?"
          description={`Archive ${confirmArchive?.title}? It will also be marked Unavailable.`}
          confirmLabel="Archive"
          pending={archive.isPending}
          onCancel={() => setConfirmArchive(null)}
          onConfirm={async () => {
            if (!confirmArchive) return;
            try {
              await archive.mutateAsync(confirmArchive.id);
              toast.success("Property archived and marked Unavailable");
            } catch (e) {
              toast.error((e as Error).message);
            }
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
            try {
              await del.mutateAsync(confirmDelete.id);
              toast.success("Property deleted");
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
