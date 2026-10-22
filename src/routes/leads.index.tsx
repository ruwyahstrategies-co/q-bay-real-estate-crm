import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Upload,
  Download,
  LayoutGrid,
  Rows3,
  Users,
  Pencil,
  Archive,
  Trash2,
  MessageCircle,
  UserCog,
  Hourglass,
} from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { DialogShell } from "@/components/overlay";
import { useSendWhatsapp } from "@/hooks/use-whatsapp";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { SegmentedControl } from "@/components/segmented-control";
import { FilterToolbar, FilterSearch, FilterSelect, ClearFiltersButton, ToolbarAlways } from "@/components/filter-toolbar";
import {
  ActiveFilterChips,
  FilterField,
  FilterGroup,
  FiltersButton,
  FiltersDrawer,
  type FilterChip,
} from "@/components/filters-drawer";
import { StaffAvatar } from "@/components/staff-avatar";
import { DataTable, dataRowCls } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { LeadImporter } from "@/components/lead-importer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PipelineStageBadge, IntentScore } from "@/components/status-badge";
import { LeadOutcomeBadge } from "@/components/lead-outcome";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { useRowSelection } from "@/hooks/use-row-selection";
import { BulkActionBar, BulkArchiveDialog, BulkDeleteDialog } from "@/components/bulk-actions";
import { LeadReassignDialog } from "@/components/lead-reassign-dialog";
import { usePendingReassignments } from "@/hooks/use-lead-reassignment";
import { cn, titleCase } from "@/lib/utils";
import { UNASSIGNED_AGENT, useArchiveLead, useDeleteLead, useLeads, useUpdateLead } from "@/hooks/use-leads";
import { useLeadChannels } from "@/hooks/use-channels";
import { useDebounced } from "@/hooks/use-debounced";
import { useAllCompletedAnalyses } from "@/hooks/use-ai-analyses";
import { useTeamMembers } from "@/hooks/use-team";
import { useDevelopments } from "@/hooks/use-developments";
import {
  fmtMoney,
  fmtDate,
  LEAD_CLASSIFICATION_LABELS,
  LEAD_INTENTS,
  LEAD_INTENT_LABELS,
  LEAD_WORKFLOWS,
  classificationsForIntent,
  type Lead,
  type LeadIntent,
} from "@/lib/db";
import { effectiveIntentScore } from "@/lib/intent";
import { useAreas, useCountries } from "@/hooks/use-locations";
import { MaskedPhone } from "@/components/masked-phone";

const drawerInputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Leads" },
      { name: "description", content: "Manage buyer leads, intent and pipeline stages." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const [open, setOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [view, setView] = useState<"table" | "cards">("table");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [intent, setIntent] = useState<LeadIntent>("sale");
  const [classification, setClassification] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [budgetMinText, setBudgetMinText] = useState("");
  const [budgetMaxText, setBudgetMaxText] = useState("");
  const [countryId, setCountryId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Lead | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [archivedView, setArchivedView] = useState(false);
  const [bulk, setBulk] = useState<null | "reassign" | "archive" | "restore" | "delete">(null);
  // The ids a bulk dialog acts on are frozen when it opens, so its wording stays correct as rows change.
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  // Handing a lead to another agent always opens the Reassign popup (Start all over / Continue, deadline).
  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const { data: pendingHandovers = [] } = usePendingReassignments();
  const handoverByLead = useMemo(() => new Map(pendingHandovers.map((r) => [r.lead_id, r])), [pendingHandovers]);

  const debouncedBudgetMin = useDebounced(budgetMinText, 400);
  const debouncedBudgetMax = useDebounced(budgetMaxText, 400);
  const toAmount = (t: string) => (t.trim() !== "" && Number.isFinite(Number(t)) ? Number(t) : null);
  const budgetMin = toAmount(debouncedBudgetMin);
  const budgetMax = toAmount(debouncedBudgetMax);
  const budgetInvalid = budgetMin != null && budgetMax != null && budgetMin > budgetMax;
  const dateRangeInvalid = !!createdFrom && !!createdTo && createdFrom > createdTo;
  const [customFieldFilterKey, setCustomFieldFilterKey] = useState<string | null>(null);
  const [customFieldFilterValue, setCustomFieldFilterValue] = useState<string | null>(null);
  const { data: leadFieldDefs = [] } = useFieldDefinitions("lead", { activeOnly: true });
  const filterableFieldDefs = useMemo(
    () => leadFieldDefs.filter((d) => d.is_filterable),
    [leadFieldDefs],
  );
  const activeCustomFieldDef = filterableFieldDefs.find((d) => d.key === customFieldFilterKey) ?? null;

  // Every filter is applied in the database, custom fields included.
  const { data: leads = [], isLoading } = useLeads({
    status: archivedView ? "archived" : "active",
    search,
    stage,
    agent,
    classification,
    workflow,
    developmentId,
    intent,
    source,
    createdFrom: dateRangeInvalid ? null : createdFrom || null,
    createdTo: dateRangeInvalid ? null : createdTo || null,
    budgetMin: budgetInvalid ? null : budgetMin,
    budgetMax: budgetInvalid ? null : budgetMax,
    countryId,
    areaId,
    customField:
      activeCustomFieldDef && customFieldFilterValue
        ? { key: activeCustomFieldDef.key, type: activeCustomFieldDef.field_type, value: customFieldFilterValue }
        : null,
  });
  const { data: team = [] } = useTeamMembers();
  const { data: developments = [] } = useDevelopments();
  const { data: stages = [] } = usePipelineStages({ activeOnly: true });
  const { data: completedAnalyses = [] } = useAllCompletedAnalyses();
  const { data: areas = [] } = useAreas();
  const { data: countries = [] } = useCountries();
  const { data: channels = [] } = useLeadChannels({ activeOnly: true });
  const areaNameById = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);
  const exportableFieldDefs = useMemo(
    () => leadFieldDefs.filter((d) => d.is_exportable),
    [leadFieldDefs],
  );
  // The database has already applied every filter, so what came back is what is shown.
  const visibleLeads = leads;
  const selection = useRowSelection(visibleLeads.map((l) => l.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selection.someSelected;
  }, [selection.someSelected]);

  const stageName = (key: string) => stages.find((s) => s.stage_key === key)?.name ?? titleCase(key);
  const customValueLabel = (v: string) =>
    v === "true" ? "Yes" : v === "false" ? "No" : v;
  // Every filter that is on, with how to turn it off. The drawer count, the chips and "Clear all" share this.
  const filterChips: FilterChip[] = [
    stage && { key: "stage", label: `Stage: ${stageName(stage)}`, onRemove: () => setStage(null) },
    agent && {
      key: "agent",
      label: `Agent: ${agent === UNASSIGNED_AGENT ? "Unassigned" : (team.find((t) => t.id === agent)?.full_name ?? "selected")}`,
      onRemove: () => setAgent(null),
    },
    classification && {
      key: "classification",
      label: `Type: ${LEAD_CLASSIFICATION_LABELS[classification] ?? titleCase(classification)}`,
      onRemove: () => setClassification(null),
    },
    workflow && { key: "workflow", label: `Workflow: ${titleCase(workflow)}`, onRemove: () => setWorkflow(null) },
    developmentId && {
      key: "development",
      label: `Development: ${developments.find((d) => d.id === developmentId)?.name ?? "selected"}`,
      onRemove: () => setDevelopmentId(null),
    },
    source && { key: "source", label: `Source: ${source}`, onRemove: () => setSource(null) },
    countryId && {
      key: "country",
      label: `Country: ${countries.find((c) => c.id === countryId)?.name ?? "selected"}`,
      onRemove: () => {
        setCountryId(null);
        setAreaId(null);
      },
    },
    areaId && {
      key: "area",
      label: `Area: ${areaNameById.get(areaId) ?? "selected"}`,
      onRemove: () => setAreaId(null),
    },
    createdFrom && { key: "from", label: `Created from ${createdFrom}`, onRemove: () => setCreatedFrom("") },
    createdTo && { key: "to", label: `Created to ${createdTo}`, onRemove: () => setCreatedTo("") },
    budgetMinText.trim() && { key: "bmin", label: `Budget from ${budgetMinText}`, onRemove: () => setBudgetMinText("") },
    budgetMaxText.trim() && { key: "bmax", label: `Budget to ${budgetMaxText}`, onRemove: () => setBudgetMaxText("") },
    activeCustomFieldDef &&
      customFieldFilterValue && {
        key: "custom",
        label: `${activeCustomFieldDef.label}: ${customValueLabel(customFieldFilterValue)}`,
        onRemove: () => {
          setCustomFieldFilterKey(null);
          setCustomFieldFilterValue(null);
        },
      },
  ].filter(Boolean) as FilterChip[];
  const drawerFilterCount = filterChips.length;
  const activeFilterCount = drawerFilterCount + (search.trim() ? 1 : 0);
  function clearDrawerFilters() {
    setStage(null);
    setAgent(null);
    setClassification(null);
    setWorkflow(null);
    setDevelopmentId(null);
    setSource(null);
    setCountryId(null);
    setAreaId(null);
    setCreatedFrom("");
    setCreatedTo("");
    setBudgetMinText("");
    setBudgetMaxText("");
    setCustomFieldFilterKey(null);
    setCustomFieldFilterValue(null);
  }
  function clearFilters() {
    setSearch("");
    clearDrawerFilters();
  }
  function openBulk(kind: "reassign" | "archive" | "restore" | "delete") {
    setBulkIds([...selection.selected]);
    setBulk(kind);
  }
  const archive = useArchiveLead();
  const del = useDeleteLead();
  const updateLead = useUpdateLead();
  const agentName = (id: string | null) => team.find((t) => t.id === id)?.full_name ?? "Unassigned";
  const { can } = usePermissions();
  const canCreate = can("leads", "create");
  const canEdit = can("leads", "edit");
  const canDelete = can("leads", "delete");
  const canAssign = can("leads", "assign");
  // Super Administrator override, checked again by the database on every record.
  const canReassign = can("leads", "reassign");

  // Latest completed analysis per lead, powering the Intent Score column.
  const intentByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of completedAnalyses) {
      if (!a.lead_id || map.has(a.lead_id)) continue;
      const out = a.output_json as any;
      const score = out?.deep_analysis?.intent_score ?? out?.intentScore;
      if (typeof score === "number") map.set(a.lead_id, score);
    }
    return map;
  }, [completedAnalyses]);

  async function assignAgent(leadId: string, agentId: string | null) {
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { assigned_agent_id: agentId } });
      toast.success(agentId ? "Agent assigned" : "Lead unassigned");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell>
      <PermissionGate module="leads" action="view" page>
        <PageHeader
          eyebrow={intent === "rent" ? "Renters" : "Buyers"}
          title={intent === "rent" ? "Rent Leads" : "Sale Leads"}
          description="Centralised buyer database with intent, budget and stage."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, visibleLeads, [
                    { key: "full_name", label: "Full name" },
                    { key: "phone", label: "Phone" },
                    { key: "email", label: "Email" },
                    { key: "transaction_intent", label: "Sale / Rent" },
                    { key: "classification", label: "Classification" },
                    { key: "workflow", label: "Workflow" },
                    { key: "budget_min", label: "Budget min" },
                    { key: "budget_max", label: "Budget max" },
                    { key: "currency", label: "Currency" },
                    { key: "preferred_locations", label: "Preferred locations" },
                    { key: "preferred_property_types", label: "Preferred property types" },
                    { key: "pipeline_stage", label: "Pipeline stage" },
                    { key: "lead_source", label: "Source" },
                    { key: "assigned_agent_id", label: "Assigned agent id" },
                    { key: "created_at", label: "Created" },
                    ...exportableFieldDefs.map((d) => ({
                      key: d.key,
                      label: d.label,
                      get: (row: Lead) => (row.custom_fields as Record<string, unknown> | null)?.[d.key],
                    })),
                  ])
                }
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              {canCreate && (
                <Button variant="outline" size="sm" onClick={() => setImporterOpen(true)}>
                  <Upload className="h-3.5 w-3.5" /> Import Leads
                </Button>
              )}
              {canCreate && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditLead(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Lead
                </Button>
              )}
            </>
          }
        />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl<LeadIntent>
            ariaLabel="Lead intent"
            tone="green"
            size="lg"
            value={intent}
            onChange={(i) => {
              setIntent(i);
              if (classification && !classificationsForIntent(i).includes(classification)) {
                setClassification(null);
              }
              selection.clear();
            }}
            options={LEAD_INTENTS.map((i) => ({ value: i, label: LEAD_INTENT_LABELS[i] }))}
          />
          <div className="flex items-center gap-3">
            <SegmentedControl<"active" | "archived">
              ariaLabel="Lead status"
              size="md"
              value={archivedView ? "archived" : "active"}
              onChange={(v) => {
                setArchivedView(v === "archived");
                selection.clear();
              }}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {isLoading ? "Loading..." : `${visibleLeads.length} ${visibleLeads.length === 1 ? "lead" : "leads"} shown`}
            </p>
          </div>
        </div>

        <FilterToolbar ariaLabel="Lead filters" activeCount={drawerFilterCount}>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Search by name, phone, email..."
            className="basis-full xl:basis-auto"
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
                { value: "cards", ariaLabel: "Card view", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              ]}
            />
          </ToolbarAlways>
        </FilterToolbar>
        <ActiveFilterChips chips={filterChips} />
        {(budgetInvalid || dateRangeInvalid) && (
          <p role="alert" className="-mt-2 mb-3 text-xs text-destructive">
            {budgetInvalid ? "The minimum budget is higher than the maximum, so the budget filter is not applied. " : ""}
            {dateRangeInvalid ? "The start date is after the end date, so the date filter is not applied." : ""}
          </p>
        )}
        <FiltersDrawer
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title="Lead filters"
          activeCount={drawerFilterCount}
          resultText={isLoading ? "Loading..." : `Show ${visibleLeads.length} ${visibleLeads.length === 1 ? "lead" : "leads"}`}
          onClear={clearDrawerFilters}
        >
          <FilterGroup title="Pipeline">
            <FilterField label="Stage">
              <FilterSelect
                label="Stage"
                value={stage}
                onChange={setStage}
                options={stages.map((s) => ({ value: s.stage_key, label: s.name }))}
                allLabel="All stages"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Agent">
              <FilterSelect
                label="Agent"
                value={agent}
                onChange={setAgent}
                options={[
                  { value: UNASSIGNED_AGENT, label: "Unassigned" },
                  ...team.map((m) => ({ value: m.id, label: m.full_name })),
                ]}
                allLabel="All agents"
                searchable
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Workflow">
              <FilterSelect
                label="Workflow"
                value={workflow}
                onChange={setWorkflow}
                options={LEAD_WORKFLOWS.map((w) => ({ value: w, label: titleCase(w) }))}
                allLabel="Sales + Telesales"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Type">
              <FilterSelect
                label="Classification"
                value={classification}
                onChange={setClassification}
                options={classificationsForIntent(intent).map((c) => ({
                  value: c,
                  label: LEAD_CLASSIFICATION_LABELS[c] ?? titleCase(c),
                }))}
                allLabel="All types"
                className="w-full sm:w-full"
              />
            </FilterField>
          </FilterGroup>

          <FilterGroup title="Source and interest">
            <FilterField label="Lead source">
              <FilterSelect
                label="Lead source"
                value={source}
                onChange={setSource}
                options={channels.map((c) => ({ value: c.name, label: c.name }))}
                allLabel="All sources"
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
            <FilterField label="Preferred country">
              <FilterSelect
                label="Preferred country"
                value={countryId}
                onChange={(v) => {
                  setCountryId(v);
                  setAreaId(null);
                }}
                options={countries.map((c) => ({ value: c.id, label: c.name }))}
                allLabel="Any country"
                className="w-full sm:w-full"
              />
            </FilterField>
            <FilterField label="Preferred area">
              <FilterSelect
                label="Preferred area"
                value={areaId}
                onChange={setAreaId}
                options={areas
                  .filter((a) => !countryId || a.country_id === countryId)
                  .map((a) => ({ value: a.id, label: a.name }))}
                allLabel="Any area"
                searchable
                className="w-full sm:w-full"
              />
            </FilterField>
          </FilterGroup>

          <FilterGroup title="Dates and budget">
            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Created from">
                <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className={drawerInputCls} />
              </FilterField>
              <FilterField label="Created to">
                <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className={drawerInputCls} />
              </FilterField>
              <FilterField label="Budget from">
                <input type="number" inputMode="numeric" min={0} value={budgetMinText} onChange={(e) => setBudgetMinText(e.target.value)} placeholder="Min" className={drawerInputCls} />
              </FilterField>
              <FilterField label="Budget to">
                <input type="number" inputMode="numeric" min={0} value={budgetMaxText} onChange={(e) => setBudgetMaxText(e.target.value)} placeholder="Max" className={drawerInputCls} />
              </FilterField>
            </div>
            <p className="text-[11px] text-muted-foreground">A lead matches when its budget range overlaps the one you enter.</p>
          </FilterGroup>

          {filterableFieldDefs.length > 0 && (
            <FilterGroup title="Custom fields">
              <FilterField label="Field">
                <FilterSelect
                  label="Custom field"
                  value={customFieldFilterKey}
                  onChange={(v) => {
                    setCustomFieldFilterKey(v);
                    setCustomFieldFilterValue(null);
                  }}
                  options={filterableFieldDefs.map((d) => ({ value: d.key, label: d.label }))}
                  allLabel="Choose a field"
                  className="w-full sm:w-full"
                />
              </FilterField>
              {activeCustomFieldDef && (
                <FilterField label={activeCustomFieldDef.label}>
                  {["select", "multiselect", "boolean", "checkbox"].includes(activeCustomFieldDef.field_type) ? (
                    <FilterSelect
                      label={activeCustomFieldDef.label}
                      value={customFieldFilterValue}
                      onChange={setCustomFieldFilterValue}
                      options={
                        activeCustomFieldDef.field_type === "boolean" || activeCustomFieldDef.field_type === "checkbox"
                          ? [
                              { value: "true", label: "Yes" },
                              { value: "false", label: "No" },
                            ]
                          : ((activeCustomFieldDef.options as string[] | null) ?? []).map((o) => ({ value: o, label: o }))
                      }
                      allLabel="Any value"
                      className="w-full sm:w-full"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="Contains..."
                      aria-label={`${activeCustomFieldDef.label} contains`}
                      value={customFieldFilterValue ?? ""}
                      onChange={(e) => setCustomFieldFilterValue(e.target.value || null)}
                      className={drawerInputCls}
                    />
                  )}
                </FilterField>
              )}
            </FilterGroup>
          )}
        </FiltersDrawer>

        <BulkActionBar
          count={selection.count}
          noun="lead"
          canReassign={canReassign}
          canArchive={canEdit}
          canDelete={canDelete}
          showingArchived={archivedView}
          onReassign={() => openBulk("reassign")}
          onArchive={() => openBulk("archive")}
          onRestore={() => openBulk("restore")}
          onDelete={() => openBulk("delete")}
          onClear={selection.clear}
        >
          {!archivedView && (
            <Button size="sm" variant="outline" onClick={() => setBroadcastOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Broadcast
            </Button>
          )}
        </BulkActionBar>

        {view === "table" ? (
          <DataTable
            leadingHeader={
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select all visible leads"
                checked={selection.allSelected}
                disabled={visibleLeads.length === 0}
                onChange={(e) => selection.toggleAll(e.target.checked)}
              />
            }
            columns={[
              "Buyer",
              "Contact",
              "Budget",
              "Preferred Area",
              "Property Type",
              "Intent Score",
              "Pipeline Stage",
              "Assigned Agent",
              "Last Contact",
              "Actions",
            ]}
            empty={
              isLoading ? (
                <EmptyState title="Loading leads..." />
              ) : (
                <EmptyState
                  icon={<Users className="h-4 w-4" />}
                  title={activeFilterCount ? "No leads match these filters" : "No leads yet"}
                  description={
                    activeFilterCount
                      ? "Try removing a filter."
                      : "Add a lead manually or import a CSV/XLSX file to get started."
                  }
                  action={
                    activeFilterCount ? (
                      <Button size="sm" variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canCreate ? (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setImporterOpen(true)}>
                          <Upload className="h-3.5 w-3.5" /> Import Leads
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditLead(null);
                            setOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Lead
                        </Button>
                      </div>
                    ) : undefined
                  }
                />
              )
            }
          >
            {visibleLeads.length > 0
              ? visibleLeads.map((l) => (
                  <tr
                    key={l.id}
                    data-selected={selection.selected.has(l.id) || undefined}
                    className={cn(dataRowCls, selection.selected.has(l.id) && "bg-qbay-soft/40")}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.full_name}`}
                        checked={selection.selected.has(l.id)}
                        onChange={(e) => selection.toggle(l.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="hover:underline"
                      >
                        {l.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>
                        <MaskedPhone value={l.phone} />
                      </div>
                      <div>{l.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.budget_max ? fmtMoney(l.budget_max, l.currency) : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(l.preferred_area_id && areaNameById.get(l.preferred_area_id)) ||
                        l.preferred_locations?.join(", ") ||
                        "-"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.preferred_property_types?.join(", ") ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {intentByLead.has(l.id) ? (
                        <IntentScore score={effectiveIntentScore(intentByLead.get(l.id)!, l)} />
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title="Run AI analysis to score this lead"
                        >
                          Not analysed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <PipelineStageBadge stage={stageLabelFrom(stages, l.pipeline_stage)} />
                        <LeadOutcomeBadge lead={l} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {canAssign && !l.assigned_agent_id ? (
                        // Nobody holds the lead yet, so it can simply be assigned.
                        <SelectField
                          value={l.assigned_agent_id}
                          onChange={(v) => assignAgent(l.id, v)}
                          options={team
                            .filter((m) => m.is_active !== false)
                            .map((m) => ({ value: m.id, label: m.full_name }))}
                          emptyLabel="Unassigned"
                          className="h-8 max-w-[150px] text-xs"
                          aria-label={`Assign agent for ${l.full_name}`}
                        />
                      ) : l.assigned_agent_id ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <StaffAvatar
                            name={agentName(l.assigned_agent_id)}
                            url={team.find((t) => t.id === l.assigned_agent_id)?.avatar_url}
                            size="xs"
                          />
                          {agentName(l.assigned_agent_id)}
                          {handoverByLead.get(l.id) && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-qbay-tint px-2 py-0.5 text-[10px] text-qbay"
                              title="A handover is waiting for the receiving agent to accept"
                            >
                              <Hourglass className="h-2.5 w-2.5" />
                              to {agentName(handoverByLead.get(l.id)!.to_agent_id)}
                            </span>
                          )}
                          {canAssign && !handoverByLead.get(l.id) && (
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Reassign this lead"
                              aria-label={`Reassign ${l.full_name}`}
                              onClick={() => setReassignLead(l)}
                            >
                              <UserCog className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtDate(l.updated_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Edit"
                            aria-label={`Edit ${l.full_name}`}
                            onClick={() => {
                              setEditLead(l);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && !archivedView && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted"
                            title="Archive"
                            aria-label={`Archive ${l.full_name}`}
                            onClick={() => setConfirmArchive(l)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="rounded-md p-1.5 hover:bg-muted text-destructive"
                            title="Delete"
                            aria-label={`Delete ${l.full_name}`}
                            onClick={() => setConfirmDelete(l)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </DataTable>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleLeads.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={<Users className="h-4 w-4" />}
                  title={activeFilterCount ? "No leads match these filters" : "No leads yet"}
                  description={activeFilterCount ? "Try removing a filter." : "Add a lead to see cards here."}
                />
              </div>
            ) : (
              visibleLeads.map((l) => {
                const member = team.find((t) => t.id === l.assigned_agent_id);
                return (
                  <Link
                    key={l.id}
                    to="/leads/$leadId"
                    params={{ leadId: l.id }}
                    className="group flex flex-col rounded-xl border border-border bg-canvas p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold">{l.full_name}</h4>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.phone ? <MaskedPhone value={l.phone} /> : (l.email ?? "-")}</p>
                      </div>
                      <PipelineStageBadge stage={stageLabelFrom(stages, l.pipeline_stage)} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Budget</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">{l.budget_max ? fmtMoney(l.budget_max, l.currency) : "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Area</dt>
                        <dd className="mt-0.5 truncate font-medium">
                          {(l.preferred_area_id && areaNameById.get(l.preferred_area_id)) ||
                            l.preferred_locations?.join(", ") ||
                            "-"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        {member ? (
                          <>
                            <StaffAvatar name={member.full_name} url={member.avatar_url} size="xs" />
                            {member.full_name}
                          </>
                        ) : (
                          "Unassigned"
                        )}
                      </span>
                      <span>{fmtDate(l.updated_at)}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}

        <AddLeadDrawer open={open} onOpenChange={setOpen} lead={editLead} defaultIntent={intent} />
        <LeadImporter open={importerOpen} onOpenChange={setImporterOpen} />
        <BroadcastDialog
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          leads={visibleLeads.filter((l) => selection.selected.has(l.id))}
          onDone={selection.clear}
        />
        <LeadReassignDialog
          open={bulk === "reassign"}
          onOpenChange={(v) => !v && setBulk(null)}
          leads={leads.filter((l) => bulkIds.includes(l.id))}
          onDone={selection.clear}
        />
        <LeadReassignDialog
          open={!!reassignLead}
          onOpenChange={(v) => !v && setReassignLead(null)}
          leads={reassignLead ? [reassignLead] : []}
        />
        <BulkArchiveDialog
          open={bulk === "archive" || bulk === "restore"}
          onOpenChange={(v) => !v && setBulk(null)}
          entity="leads"
          noun="lead"
          ids={bulkIds}
          restore={bulk === "restore"}
          onFinished={selection.clear}
        />
        <BulkDeleteDialog
          open={bulk === "delete"}
          onOpenChange={(v) => !v && setBulk(null)}
          entity="leads"
          noun="lead"
          ids={bulkIds}
        />
        <ConfirmDialog
          open={!!confirmArchive}
          title="Archive lead?"
          description={`Archive ${confirmArchive?.full_name}? You can restore it later.`}
          confirmLabel="Archive"
          pending={archive.isPending}
          onCancel={() => setConfirmArchive(null)}
          onConfirm={async () => {
            if (!confirmArchive) return;
            try {
              await archive.mutateAsync(confirmArchive.id);
              toast.success("Lead archived");
            } catch (e) {
              toast.error((e as Error).message);
            }
            setConfirmArchive(null);
          }}
        />
        <ConfirmDialog
          open={!!confirmDelete}
          title="Permanently delete lead?"
          description={`Delete ${confirmDelete?.full_name}. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          pending={del.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            if (!confirmDelete) return;
            try {
              await del.mutateAsync(confirmDelete.id);
              toast.success("Lead deleted");
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
// Broadcasts through EACH lead's assigned agent's OWN WhatsApp connection -
// the caller can only successfully send for leads assigned to themselves
// (whatsapp-send resolves the connection from the signed-in caller), so this
// is naturally scoped per-agent rather than a global sender. Failures per
// recipient (e.g. a lead assigned to a different, unconnected agent) are
// reported individually rather than blocking the whole batch.
function BroadcastDialog({
  open,
  onOpenChange,
  leads,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  onDone: () => void;
}) {
  const send = useSendWhatsapp();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(
    null,
  );

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    const out: { name: string; ok: boolean; error?: string }[] = [];
    for (const l of leads) {
      if (!l.phone) {
        out.push({ name: l.full_name, ok: false, error: "No phone number" });
        continue;
      }
      try {
        await send.mutateAsync({ lead_id: l.id, to: l.phone, message: message.trim() });
        out.push({ name: l.full_name, ok: true });
      } catch (e) {
        out.push({ name: l.full_name, ok: false, error: (e as Error).message });
      }
    }
    setResults(out);
    setSending(false);
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => {
        if (!sending) {
          onOpenChange(v);
          if (!v) {
            setMessage("");
            setResults(null);
          }
        }
      }}
      widthClassName="max-w-lg"
      ariaLabel="WhatsApp broadcast"
    >
      <div className="p-5">
        <h3 className="text-base font-semibold">WhatsApp Broadcast</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sends via each recipient's assigned agent's own WhatsApp Business connection - there is no
          shared sender. Sending only succeeds for leads assigned to your own connected number.
        </p>
        <p className="mt-2 text-xs font-medium">
          {leads.length} recipient{leads.length === 1 ? "" : "s"} selected
        </p>

        {!results ? (
          <>
            <textarea
              className="mt-3 h-28 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              placeholder="Message (respect Meta's 24h/template rules for first contact)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={sending || !message.trim()} onClick={handleSend}>
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">
              {results.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1"
                >
                  <span>{r.name}</span>
                  <span className={r.ok ? "text-foreground" : "text-destructive"}>
                    {r.ok ? "Sent" : r.error}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onDone();
                }}
              >
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
