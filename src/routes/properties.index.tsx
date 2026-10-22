import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
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
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton, ToolbarAlways } from "@/components/filter-toolbar";
import { StaffAvatar } from "@/components/staff-avatar";
import { MultiSelectField } from "@/components/multi-select-field";
import { ApprovalBadge } from "@/components/approval-badge";
import { useCountries, useAreas, usePlaces } from "@/hooks/use-locations";
import { AvailabilityRing, PurposeBadge } from "@/components/status-badge";
import { PropertyWebsiteLinkIcon } from "@/components/property-website-link";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { cn } from "@/lib/utils";
import {
  usePropertiesPage,
  fetchPropertiesForExport,
  usePendingApprovalCount,
  APPROVAL_LABELS,
  PROPERTY_PAGE_SIZE,
  type ApprovalStatus,
  type PropertyFilters,
  useArchiveProperty,
  useRestoreProperty,
  useDeleteProperty,
  usePropertyThumbnails,
  usePropertyPurposeCounts,
  type PropertyListRow,
  type PropertyPurposeTab,
} from "@/hooks/use-properties";
import { ActiveFilterChips, FiltersButton, type FilterChip } from "@/components/filters-drawer";
import { PropertyFiltersDrawer } from "@/components/property-filters-drawer";
import {
  EMPTY_PROPERTY_FILTERS,
  propertyFilterCount,
  propertyFilterProblems,
  propertyQueryFrom,
  type PropertyFilterState,
} from "@/lib/list-filters";
import { useDevelopments } from "@/hooks/use-developments";
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

function PropertiesPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"table" | "grid">("table");
  const [purpose, setPurpose] = useState<PropertyPurposeTab>("sale");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Property | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PropertyFilterState>(EMPTY_PROPERTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [confirmArchive, setConfirmArchive] = useState<Property | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Property | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);

  const { data: countries = [] } = useCountries();
  const { data: allAreas = [] } = useAreas();
  const { data: allPlaces = [] } = usePlaces();
  // Every filter is applied in the database. Sale | Rent, archive state, availability, type, search, price
  // range, agents, location and approval all combine, and the list and its counts share one definition.
  const baseFilters: Omit<PropertyFilters, "purpose"> = { search, ...propertyQueryFrom(filters) };
  const filterSignature = JSON.stringify([baseFilters, purpose]);
  useEffect(() => setPage(0), [filterSignature]);

  const { data: pageData, isLoading } = usePropertiesPage({ ...baseFilters, purpose }, page);
  const properties = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PROPERTY_PAGE_SIZE) - 1);
  const showingFrom = total === 0 ? 0 : page * PROPERTY_PAGE_SIZE + 1;
  const showingTo = Math.min(total, (page + 1) * PROPERTY_PAGE_SIZE);
  const { data: purposeCounts } = usePropertyPurposeCounts(baseFilters);
  const { data: thumbnails = {} } = usePropertyThumbnails(properties.map((p) => p.id));
  const { data: propertyFieldDefs = [] } = useFieldDefinitions("property", { activeOnly: true });
  const exportablePropertyFieldDefs = propertyFieldDefs.filter((d) => d.is_exportable);
  const { data: team = [] } = useTeamMembers();
  const { data: developments = [] } = useDevelopments();

  const nameList = (ids: string[], names: (id: string) => string) => ids.map(names).join(", ");
  const clear = <K extends keyof PropertyFilterState>(k: K, empty: PropertyFilterState[K]) =>
    () => setFilters((f) => ({ ...f, [k]: empty }));
  // Every filter that is on, with how to turn it off. The Filters count and the chips come from the same object.
  const filterChips: FilterChip[] = [
    filters.types.length > 0 && { key: "types", label: `Type: ${filters.types.join(", ")}`, onRemove: clear("types", []) },
    filters.availabilities.length > 0 && {
      key: "availability",
      label: `Availability: ${nameList(filters.availabilities, (a) => PROPERTY_AVAILABILITY_LABELS[a] ?? a)}`,
      onRemove: clear("availabilities", []),
    },
    filters.archive !== "active" && {
      key: "archive",
      label: `Shown: ${filters.archive === "archived" ? "Archived" : "All"}`,
      onRemove: clear("archive", "active"),
    },
    filters.minPrice.trim() && {
      key: "minPrice",
      label: `Price from ${filters.minPrice}`,
      onRemove: clear("minPrice", ""),
    },
    filters.maxPrice.trim() && { key: "maxPrice", label: `Price to ${filters.maxPrice}`, onRemove: clear("maxPrice", "") },
    filters.agentIds.length > 0 && {
      key: "agents",
      label: `Agents: ${nameList(filters.agentIds, (id) => team.find((m) => m.id === id)?.full_name ?? "selected")}`,
      onRemove: clear("agentIds", []),
    },
    filters.countryId && {
      key: "country",
      label: `Country: ${countries.find((c) => c.id === filters.countryId)?.name ?? "selected"}`,
      onRemove: () => setFilters((f) => ({ ...f, countryId: null, areaIds: [], placeId: null })),
    },
    filters.areaIds.length > 0 && {
      key: "areas",
      label: `Areas: ${nameList(filters.areaIds, (id) => allAreas.find((a) => a.id === id)?.name ?? "selected")}`,
      onRemove: () => setFilters((f) => ({ ...f, areaIds: [], placeId: null })),
    },
    filters.placeId && {
      key: "place",
      label: `Place: ${allPlaces.find((pl) => pl.id === filters.placeId)?.name ?? "selected"}`,
      onRemove: clear("placeId", null),
    },
    filters.approvals.length > 0 && {
      key: "approval",
      label: `Approval: ${nameList(filters.approvals, (a) => APPROVAL_LABELS[a as ApprovalStatus])}`,
      onRemove: clear("approvals", []),
    },
    filters.developmentIds.length > 0 && {
      key: "developments",
      label: `Developments: ${nameList(filters.developmentIds, (id) => developments.find((d) => d.id === id)?.name ?? "selected")}`,
      onRemove: clear("developmentIds", []),
    },
    filters.minBedrooms && {
      key: "beds",
      label: `${filters.minBedrooms}+ bedrooms`,
      onRemove: clear("minBedrooms", null),
    },
    filters.furnishing && {
      key: "furnishing",
      label: `Furnishing: ${filters.furnishing}`,
      onRemove: clear("furnishing", null),
    },
    filters.published && {
      key: "published",
      label: filters.published === "yes" ? "On the website" : "Not on the website",
      onRemove: clear("published", null),
    },
  ].filter(Boolean) as FilterChip[];
  const drawerFilterCount = propertyFilterCount(filters);
  const activeFilterCount = drawerFilterCount + (search.trim() ? 1 : 0);
  const filterProblems = propertyFilterProblems(filters);
  function clearFilters() {
    setSearch("");
    setFilters(EMPTY_PROPERTY_FILTERS);
  }
  const archive = useArchiveProperty();
  const restore = useRestoreProperty();
  const del = useDeleteProperty();
  const { can } = usePermissions();
  const canCreate = can("properties", "create");
  const canEdit = can("properties", "edit");
  const canHardDelete = can("properties", "hard_delete");
  const canApprove = can("properties", "approve");
  const { data: pendingCount = 0 } = usePendingApprovalCount(canApprove);

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
                onClick={async () => {
                  try {
                    const rows = await fetchPropertiesForExport({ ...baseFilters, purpose });
                    downloadCsv(
                    `properties-${new Date().toISOString().slice(0, 10)}.csv`,
                    rows,
                    [
                      { key: "title", label: "Title" },
                      { key: "reference_code", label: "Reference code" },
                      { key: "property_type", label: "Type" },
                      { key: "purpose", label: "Purpose" },
                      { key: "location", label: "Location" },
                      { key: "developer", label: "Developer" },
                      {
                        key: "development",
                        label: "Development",
                        get: (row: PropertyListRow) => row.developments?.name ?? "",
                      },
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
                        get: (row: PropertyListRow) =>
                          (row.custom_fields as Record<string, unknown> | null)?.[d.key],
                      })),
                    ],
                  );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
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
              : total === 0
                ? `No ${purpose === "sale" ? "sale" : "rental"} properties`
                : `Showing ${showingFrom}-${showingTo} of ${total} ${purpose === "sale" ? "sale" : "rental"} ${total === 1 ? "property" : "properties"}`}
          </p>
        </div>

        {canApprove && pendingCount > 0 && !filters.approvals.includes("pending") && (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-xs shadow-card"
          >
            <ShieldCheck className="h-4 w-4 text-amber-700" />
            <span className="font-medium text-amber-900">
              {pendingCount} {pendingCount === 1 ? "property is" : "properties are"} waiting for your approval.
            </span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFilters((f) => ({ ...f, approvals: ["pending"] }))}>
              Review pending
            </Button>
          </div>
        )}

        <FilterToolbar ariaLabel="Property filters" activeCount={drawerFilterCount}>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Search by title, reference, location..."
          />
          <ToolbarAlways>
            <FiltersButton count={drawerFilterCount} onClick={() => setFiltersOpen(true)} />
          </ToolbarAlways>
          <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />
          <ToolbarAlways>
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
          </ToolbarAlways>
        </FilterToolbar>
        <ActiveFilterChips chips={filterChips} />
        {filterProblems.length > 0 && (
          <p role="alert" className="-mt-2 mb-3 text-xs text-destructive">
            {filterProblems.join(" ")}
          </p>
        )}
        <PropertyFiltersDrawer
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          applied={filters}
          onApply={setFilters}
          agents={team.map((m) => ({ value: m.id, label: m.full_name }))}
          developments={developments.map((d) => ({ value: d.id, label: d.name }))}
          countries={countries.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (inactive)` }))}
          areas={allAreas.map((a) => ({
            value: a.id,
            label: a.is_active ? a.name : `${a.name} (inactive)`,
            countryId: a.country_id,
          }))}
          places={allPlaces.map((pl) => ({
            value: pl.id,
            label: pl.is_active ? pl.name : `${pl.name} (inactive)`,
            areaId: pl.area_id,
          }))}
        />

        {view === "table" ? (
          <DataTable
            columns={[
              "Property",
              "Reference",
              "Type",
              "Purpose",
              "Location",
              "Development",
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
                      {p.approval_status !== "approved" && (
                        <div className="mt-1 pl-12">
                          <ApprovalBadge status={p.approval_status} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{p.reference_code ?? "-"}</td>
                    <td className="px-4 py-3 text-xs">{p.property_type ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <PurposeBadge purpose={p.purpose} />
                    </td>
                    <td className="min-w-[150px] px-4 py-3 text-xs">{p.location ?? "-"}</td>
                    <td className="px-4 py-3 text-xs">{p.developments?.name ?? "-"}</td>
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
                        {p.approval_status !== "approved" && <ApprovalBadge status={p.approval_status} className="shadow-card" />}
                        {p.is_published && p.approval_status === "approved" && (
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

        {total > PROPERTY_PAGE_SIZE && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums" aria-live="polite">
              Page {page + 1} of {lastPage + 1}
            </span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((n) => Math.min(lastPage, n + 1))}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </span>
          </nav>
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
