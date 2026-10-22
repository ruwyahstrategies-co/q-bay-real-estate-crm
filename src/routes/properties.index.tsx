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
import { useDebounced } from "@/hooks/use-debounced";
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
import { PROPERTY_TYPE_FILTER_OPTIONS } from "@/lib/property-types";
import {
  ActiveFilterChips,
  FilterField,
  FilterGroup,
  FiltersButton,
  FiltersDrawer,
  type FilterChip,
} from "@/components/filters-drawer";
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

const PROPERTY_TYPES = PROPERTY_TYPE_FILTER_OPTIONS;

const drawerInputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";

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
  const [minPriceText, setMinPriceText] = useState("");
  const [maxPriceText, setMaxPriceText] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalStatus | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [minBedroomsText, setMinBedroomsText] = useState<string | null>(null);
  const [furnishing, setFurnishing] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [confirmArchive, setConfirmArchive] = useState<Property | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Property | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);

  const debouncedMin = useDebounced(minPriceText, 400);
  const debouncedMax = useDebounced(maxPriceText, 400);
  const toNumber = (t: string) => (t.trim() !== "" && Number.isFinite(Number(t)) ? Number(t) : null);
  const minPrice = toNumber(debouncedMin);
  const maxPrice = toNumber(debouncedMax);
  const priceRangeInvalid = minPrice != null && maxPrice != null && minPrice > maxPrice;

  const { data: countries = [] } = useCountries();
  const { data: allAreas = [] } = useAreas();
  const { data: allPlaces = [] } = usePlaces();
  const areaOptions = useMemo(
    () =>
      allAreas
        .filter((a) => !countryId || a.country_id === countryId)
        .map((a) => ({ value: a.id, label: a.is_active ? a.name : `${a.name} (inactive)` })),
    [allAreas, countryId],
  );
  const placeOptions = useMemo(
    () =>
      allPlaces
        .filter((pl) => areaIds.length === 1 && pl.area_id === areaIds[0])
        .map((pl) => ({ value: pl.id, label: pl.is_active ? pl.name : `${pl.name} (inactive)` })),
    [allPlaces, areaIds],
  );

  // Every filter is applied in the database. Sale | Rent, archive state, availability, type, search, price
  // range, agents, location and approval all combine, and the list and its counts share one definition.
  const baseFilters: Omit<PropertyFilters, "purpose"> = {
    search,
    type,
    status: statusFilter,
    availability,
    minPrice: priceRangeInvalid ? null : minPrice,
    maxPrice: priceRangeInvalid ? null : maxPrice,
    agentIds,
    countryId,
    areaIds,
    placeId,
    approval,
    developmentId,
    minBedrooms: minBedroomsText ? Number(minBedroomsText) : null,
    furnishing,
    published: published === null ? null : published === "yes",
  };
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

  // Every filter that is on, with how to turn it off. The Filters count, the chips and "Clear all" share this.
  const filterChips: FilterChip[] = [
    type && { key: "type", label: `Type: ${type}`, onRemove: () => setType(null) },
    availability && {
      key: "availability",
      label: `Availability: ${PROPERTY_AVAILABILITY_LABELS[availability] ?? availability}`,
      onRemove: () => setAvailability(null),
    },
    statusFilter !== "active" && {
      key: "status",
      label: `Shown: ${statusFilter === "archived" ? "Archived" : "All"}`,
      onRemove: () => setStatusFilter("active"),
    },
    minPrice != null && { key: "minPrice", label: `Price from ${minPrice.toLocaleString("en-US")}`, onRemove: () => setMinPriceText("") },
    maxPrice != null && { key: "maxPrice", label: `Price to ${maxPrice.toLocaleString("en-US")}`, onRemove: () => setMaxPriceText("") },
    agentIds.length > 0 && {
      key: "agents",
      label: `Agents: ${agentIds.map((id) => team.find((m) => m.id === id)?.full_name ?? "selected").join(", ")}`,
      onRemove: () => setAgentIds([]),
    },
    countryId && {
      key: "country",
      label: `Country: ${countries.find((c) => c.id === countryId)?.name ?? "selected"}`,
      onRemove: () => {
        setCountryId(null);
        setAreaIds([]);
        setPlaceId(null);
      },
    },
    areaIds.length > 0 && {
      key: "areas",
      label: `Areas: ${areaIds.map((id) => allAreas.find((a) => a.id === id)?.name ?? "selected").join(", ")}`,
      onRemove: () => {
        setAreaIds([]);
        setPlaceId(null);
      },
    },
    placeId && {
      key: "place",
      label: `Place: ${allPlaces.find((pl) => pl.id === placeId)?.name ?? "selected"}`,
      onRemove: () => setPlaceId(null),
    },
    approval && { key: "approval", label: `Approval: ${APPROVAL_LABELS[approval]}`, onRemove: () => setApproval(null) },
    developmentId && {
      key: "development",
      label: `Development: ${developments.find((d) => d.id === developmentId)?.name ?? "selected"}`,
      onRemove: () => setDevelopmentId(null),
    },
    minBedroomsText && { key: "beds", label: `${minBedroomsText}+ bedrooms`, onRemove: () => setMinBedroomsText(null) },
    furnishing && { key: "furnishing", label: `Furnishing: ${furnishing}`, onRemove: () => setFurnishing(null) },
    published && {
      key: "published",
      label: published === "yes" ? "On the website" : "Not on the website",
      onRemove: () => setPublished(null),
    },
  ].filter(Boolean) as FilterChip[];
  const drawerFilterCount = filterChips.length;
  const activeFilterCount = drawerFilterCount + (search.trim() ? 1 : 0);
  function clearDrawerFilters() {
    setType(null);
    setAvailability(null);
    setStatusFilter("active");
    setMinPriceText("");
    setMaxPriceText("");
    setAgentIds([]);
    setCountryId(null);
    setAreaIds([]);
    setPlaceId(null);
    setApproval(null);
    setDevelopmentId(null);
    setMinBedroomsText(null);
    setFurnishing(null);
    setPublished(null);
  }
  function clearFilters() {
    setSearch("");
    clearDrawerFilters();
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

        {canApprove && pendingCount > 0 && approval !== "pending" && (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-xs shadow-card"
          >
            <ShieldCheck className="h-4 w-4 text-amber-700" />
            <span className="font-medium text-amber-900">
              {pendingCount} {pendingCount === 1 ? "property is" : "properties are"} waiting for your approval.
            </span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setApproval("pending")}>
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
        <FiltersDrawer
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Property filters"
          activeCount={drawerFilterCount}
          resultText={
            isLoading ? "Loading..." : `Show ${total} ${total === 1 ? "property" : "properties"}`
          }
          onClear={clearDrawerFilters}
        >
          <FilterGroup title="The property">
            <FilterField label="Type">
              <FilterSelect
                label="Type"
                value={type}
                onChange={setType}
                options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))}
                allLabel="All types"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Availability">
              <FilterSelect
                label="Availability"
                value={availability}
                onChange={setAvailability}
                options={[...PROPERTY_AVAILABILITIES, "needs_confirmation"].map((a) => ({
                  value: a,
                  label: PROPERTY_AVAILABILITY_LABELS[a] ?? a,
                }))}
                allLabel="All availability"
                className="w-full sm:w-full"
              />
            </FilterField>
            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Price from">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={minPriceText}
                  onChange={(e) => setMinPriceText(e.target.value)}
                  placeholder="Min price"
                  aria-label="Minimum price"
                  aria-invalid={priceRangeInvalid || undefined}
                  className={`${drawerInputCls} ${priceRangeInvalid ? "border-destructive" : ""}`}
                />
              </FilterField>
              <FilterField label="Price to">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={maxPriceText}
                  onChange={(e) => setMaxPriceText(e.target.value)}
                  placeholder="Max price"
                  aria-label="Maximum price"
                  aria-invalid={priceRangeInvalid || undefined}
                  className={`${drawerInputCls} ${priceRangeInvalid ? "border-destructive" : ""}`}
                />
              </FilterField>
            </div>
            <FilterField label="Bedrooms">
              <FilterSelect
                label="Bedrooms"
                value={minBedroomsText}
                onChange={setMinBedroomsText}
                options={["1", "2", "3", "4", "5", "6"].map((n) => ({ value: n, label: `${n}+ bedrooms` }))}
                allLabel="Any number"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Furnishing">
              <FilterSelect
                label="Furnishing"
                value={furnishing}
                onChange={setFurnishing}
                options={[
                  { value: "FF", label: "FF - Fully furnished" },
                  { value: "SF", label: "SF - Semi furnished" },
                  { value: "UF", label: "UF - Unfurnished" },
                ]}
                allLabel="Any furnishing"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Development">
              <FilterSelect
                label="Development"
                value={developmentId}
                onChange={setDevelopmentId}
                options={developments.map((d) => ({ value: d.id, label: d.name }))}
                allLabel="All developments"
                searchable
                className="w-full sm:w-full"
              />
            </FilterField>
          </FilterGroup>

          <FilterGroup title="Location">
            <FilterField label="Country">
              <FilterSelect
                label="Country"
                value={countryId}
                onChange={(v) => {
                  setCountryId(v);
                  setAreaIds([]);
                  setPlaceId(null);
                }}
                options={countries.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (inactive)` }))}
                allLabel="All countries"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Areas">
              <MultiSelectField
                label="Areas"
                values={areaIds}
                onChange={(v) => {
                  setAreaIds(v);
                  setPlaceId(null);
                }}
                options={areaOptions}
                allLabel="All areas"
              />
            </FilterField>
            <FilterField label="Place" hint={areaIds.length === 1 ? undefined : "Pick exactly one area to choose a place."}>
              <FilterSelect
                label="Place"
                value={placeId}
                onChange={setPlaceId}
                options={placeOptions}
                allLabel={areaIds.length === 1 ? "All places" : "Place (pick one area)"}
                disabled={areaIds.length !== 1 || placeOptions.length === 0}
                className="w-full sm:w-full"
              />
            </FilterField>
          </FilterGroup>

          <FilterGroup title="Team and status">
            <FilterField label="Agents">
              <MultiSelectField
                label="Agents"
                values={agentIds}
                onChange={setAgentIds}
                options={team.map((m) => ({ value: m.id, label: m.full_name }))}
                allLabel="All agents"
              />
            </FilterField>
            <FilterField label="Approval">
              <FilterSelect
                label="Approval"
                value={approval}
                onChange={(v) => setApproval(v as ApprovalStatus | null)}
                options={(Object.keys(APPROVAL_LABELS) as ApprovalStatus[]).map((k) => ({ value: k, label: APPROVAL_LABELS[k] }))}
                allLabel="Any approval"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Public website">
              <FilterSelect
                label="Public website"
                value={published}
                onChange={setPublished}
                options={[
                  { value: "yes", label: "On the website" },
                  { value: "no", label: "Not on the website" },
                ]}
                allLabel="Either"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Archive state">
              <SegmentedControl
                ariaLabel="Archive state"
                size="md"
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
              />
            </FilterField>
          </FilterGroup>
        </FiltersDrawer>
        {priceRangeInvalid && (
          <p role="alert" className="-mt-2 mb-3 text-xs text-destructive">
            The minimum price is higher than the maximum, so the price filter is not applied.
          </p>
        )}

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
