import { useEffect, useState } from "react";
import { FilterField, FilterGroup, FiltersDrawer } from "./filters-drawer";
import { FilterSelect } from "./filter-toolbar";
import { MultiSelectField } from "./multi-select-field";
import { UNASSIGNED_AGENT } from "@/hooks/use-leads";
import {
  EMPTY_LEAD_FILTERS,
  leadFilterCount,
  leadFilterProblems,
  type LeadFilterState,
} from "@/lib/list-filters";
import { LEAD_OUTCOME_LABELS, LEAD_WORKFLOWS } from "@/lib/db";
import { titleCase } from "@/lib/utils";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";
const FULL = "w-full sm:w-full";

type Option = { value: string; label: string };

export type CustomFieldFilterDef = {
  key: string;
  label: string;
  field_type: string;
  options: string[] | null;
};

/**
 * Every Leads filter, edited as a draft. Apply sends the draft to the page (and so to the database); Reset
 * clears all filters. Nothing is queried while choosing.
 */
export function LeadFiltersDrawer({
  open,
  onOpenChange,
  applied,
  onApply,
  stages,
  agents,
  classifications,
  developments,
  sources,
  countries,
  areas,
  customFields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: LeadFilterState;
  onApply: (next: LeadFilterState) => void;
  stages: Option[];
  agents: Option[];
  classifications: Option[];
  developments: Option[];
  sources: Option[];
  countries: Option[];
  /** Areas with the country each belongs to, so the list narrows to the chosen country. */
  areas: (Option & { countryId: string })[];
  customFields: CustomFieldFilterDef[];
}) {
  const [draft, setDraft] = useState<LeadFilterState>(applied);
  // Each time the drawer opens it starts from what is currently applied.
  useEffect(() => {
    if (open) setDraft(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only, not when the page re-renders
  }, [open]);

  const set = <K extends keyof LeadFilterState>(k: K, v: LeadFilterState[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const customDef = customFields.find((d) => d.key === draft.customKey) ?? null;
  const areaOptions = areas.filter((a) => !draft.countryId || a.countryId === draft.countryId);

  return (
    <FiltersDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Lead filters"
      draftCount={leadFilterCount(draft)}
      problems={leadFilterProblems(draft)}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => {
        setDraft(EMPTY_LEAD_FILTERS);
        onApply(EMPTY_LEAD_FILTERS);
      }}
    >
      <FilterGroup title="Pipeline">
        <FilterField label="Stages">
          <MultiSelectField
            label="Stages"
            values={draft.stages}
            onChange={(v) => set("stages", v)}
            options={stages}
            allLabel="All stages"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Agents">
          <MultiSelectField
            label="Agents"
            values={draft.agents}
            onChange={(v) => set("agents", v)}
            options={[{ value: UNASSIGNED_AGENT, label: "Unassigned" }, ...agents]}
            allLabel="All agents"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Workflow">
          <FilterSelect
            label="Workflow"
            value={draft.workflow}
            onChange={(v) => set("workflow", v)}
            options={LEAD_WORKFLOWS.map((w) => ({ value: w, label: titleCase(w) }))}
            allLabel="Sales + Telesales"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Type">
          <MultiSelectField
            label="Type"
            values={draft.classifications}
            onChange={(v) => set("classifications", v)}
            options={classifications}
            allLabel="All types"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Outcome">
          <FilterSelect
            label="Outcome"
            value={draft.outcome}
            onChange={(v) => set("outcome", v)}
            options={Object.entries(LEAD_OUTCOME_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            allLabel="Any outcome"
            className={FULL}
          />
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Source and interest">
        <FilterField label="Lead sources">
          <MultiSelectField
            label="Lead sources"
            values={draft.sources}
            onChange={(v) => set("sources", v)}
            options={sources}
            allLabel="All sources"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Developments">
          <MultiSelectField
            label="Developments"
            values={draft.developmentIds}
            onChange={(v) => set("developmentIds", v)}
            options={developments}
            allLabel="All developments"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Preferred country">
          <FilterSelect
            label="Preferred country"
            value={draft.countryId}
            onChange={(v) => setDraft((d) => ({ ...d, countryId: v, areaIds: [] }))}
            options={countries}
            allLabel="Any country"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Preferred areas">
          <MultiSelectField
            label="Preferred areas"
            values={draft.areaIds}
            onChange={(v) => set("areaIds", v)}
            options={areaOptions}
            allLabel="Any area"
            className={FULL}
          />
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Dates and budget">
        <div className="grid grid-cols-2 gap-3">
          <FilterField label="Created from">
            <input
              type="date"
              value={draft.createdFrom}
              onChange={(e) => set("createdFrom", e.target.value)}
              className={inputCls}
            />
          </FilterField>
          <FilterField label="Created to">
            <input
              type="date"
              value={draft.createdTo}
              onChange={(e) => set("createdTo", e.target.value)}
              className={inputCls}
            />
          </FilterField>
          <FilterField label="Budget from">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.budgetMin}
              onChange={(e) => set("budgetMin", e.target.value)}
              placeholder="Min"
              className={inputCls}
            />
          </FilterField>
          <FilterField label="Budget to">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.budgetMax}
              onChange={(e) => set("budgetMax", e.target.value)}
              placeholder="Max"
              className={inputCls}
            />
          </FilterField>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A lead matches when its budget range overlaps the one you enter.
        </p>
      </FilterGroup>

      {customFields.length > 0 && (
        <FilterGroup title="Custom fields">
          <FilterField label="Field">
            <FilterSelect
              label="Custom field"
              value={draft.customKey}
              onChange={(v) => setDraft((d) => ({ ...d, customKey: v, customValue: null }))}
              options={customFields.map((d) => ({ value: d.key, label: d.label }))}
              allLabel="Choose a field"
              className={FULL}
            />
          </FilterField>
          {customDef && (
            <FilterField label={customDef.label}>
              {["select", "multiselect", "boolean", "checkbox"].includes(customDef.field_type) ? (
                <FilterSelect
                  label={customDef.label}
                  value={draft.customValue}
                  onChange={(v) => set("customValue", v)}
                  options={
                    customDef.field_type === "boolean" || customDef.field_type === "checkbox"
                      ? [
                          { value: "true", label: "Yes" },
                          { value: "false", label: "No" },
                        ]
                      : (customDef.options ?? []).map((o) => ({ value: o, label: o }))
                  }
                  allLabel="Any value"
                  className={FULL}
                />
              ) : (
                <input
                  type="text"
                  placeholder="Contains..."
                  aria-label={`${customDef.label} contains`}
                  value={draft.customValue ?? ""}
                  onChange={(e) => set("customValue", e.target.value || null)}
                  className={inputCls}
                />
              )}
            </FilterField>
          )}
        </FilterGroup>
      )}
    </FiltersDrawer>
  );
}
