import { useEffect, useMemo, useState } from "react";
import { FilterField, FilterGroup, FiltersDrawer } from "./filters-drawer";
import { FilterSelect } from "./filter-toolbar";
import { MultiSelectField } from "./multi-select-field";
import { SegmentedControl } from "./segmented-control";
import {
  EMPTY_PROPERTY_FILTERS,
  propertyFilterCount,
  propertyFilterProblems,
  type PropertyFilterState,
} from "@/lib/list-filters";
import { PROPERTY_TYPE_FILTER_OPTIONS } from "@/lib/property-types";
import { PROPERTY_AVAILABILITIES, PROPERTY_AVAILABILITY_LABELS } from "@/lib/db";
import { APPROVAL_LABELS, type ApprovalStatus } from "@/hooks/use-properties";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";
const FULL = "w-full sm:w-full";

type Option = { value: string; label: string };

const ARCHIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

/** Every Properties filter, edited as a draft. Apply sends it to the database; Reset clears all filters. */
export function PropertyFiltersDrawer({
  open,
  onOpenChange,
  applied,
  onApply,
  agents,
  developments,
  countries,
  areas,
  places,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: PropertyFilterState;
  onApply: (next: PropertyFilterState) => void;
  agents: Option[];
  developments: Option[];
  countries: Option[];
  areas: (Option & { countryId: string })[];
  places: (Option & { areaId: string })[];
}) {
  const [draft, setDraft] = useState<PropertyFilterState>(applied);
  useEffect(() => {
    if (open) setDraft(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only, not when the page re-renders
  }, [open]);

  const set = <K extends keyof PropertyFilterState>(k: K, v: PropertyFilterState[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const areaOptions = useMemo(
    () => areas.filter((a) => !draft.countryId || a.countryId === draft.countryId),
    [areas, draft.countryId],
  );
  const placeOptions = useMemo(
    () => (draft.areaIds.length === 1 ? places.filter((p) => p.areaId === draft.areaIds[0]) : []),
    [places, draft.areaIds],
  );

  return (
    <FiltersDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Property filters"
      draftCount={propertyFilterCount(draft)}
      problems={propertyFilterProblems(draft)}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => {
        setDraft(EMPTY_PROPERTY_FILTERS);
        onApply(EMPTY_PROPERTY_FILTERS);
      }}
    >
      <FilterGroup title="The property">
        <FilterField label="Types">
          <MultiSelectField
            label="Types"
            values={draft.types}
            onChange={(v) => set("types", v)}
            options={PROPERTY_TYPE_FILTER_OPTIONS.map((t) => ({ value: t, label: t }))}
            allLabel="All types"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Availability">
          <MultiSelectField
            label="Availability"
            values={draft.availabilities}
            onChange={(v) => set("availabilities", v)}
            options={[...PROPERTY_AVAILABILITIES, "needs_confirmation"].map((a) => ({
              value: a,
              label: PROPERTY_AVAILABILITY_LABELS[a] ?? a,
            }))}
            allLabel="All availability"
            className={FULL}
          />
        </FilterField>
        <div className="grid grid-cols-2 gap-3">
          <FilterField label="Price from">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.minPrice}
              onChange={(e) => set("minPrice", e.target.value)}
              placeholder="Min price"
              className={inputCls}
            />
          </FilterField>
          <FilterField label="Price to">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.maxPrice}
              onChange={(e) => set("maxPrice", e.target.value)}
              placeholder="Max price"
              className={inputCls}
            />
          </FilterField>
        </div>
        <FilterField label="Bedrooms">
          <FilterSelect
            label="Bedrooms"
            value={draft.minBedrooms}
            onChange={(v) => set("minBedrooms", v)}
            options={["1", "2", "3", "4", "5", "6"].map((n) => ({
              value: n,
              label: `${n}+ bedrooms`,
            }))}
            allLabel="Any number"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Furnishing">
          <FilterSelect
            label="Furnishing"
            value={draft.furnishing}
            onChange={(v) => set("furnishing", v)}
            options={[
              { value: "FF", label: "FF - Fully furnished" },
              { value: "SF", label: "SF - Semi furnished" },
              { value: "UF", label: "UF - Unfurnished" },
            ]}
            allLabel="Any furnishing"
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
      </FilterGroup>

      <FilterGroup title="Location">
        <FilterField label="Country">
          <FilterSelect
            label="Country"
            value={draft.countryId}
            onChange={(v) => setDraft((d) => ({ ...d, countryId: v, areaIds: [], placeId: null }))}
            options={countries}
            allLabel="All countries"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Areas">
          <MultiSelectField
            label="Areas"
            values={draft.areaIds}
            onChange={(v) => setDraft((d) => ({ ...d, areaIds: v, placeId: null }))}
            options={areaOptions}
            allLabel="All areas"
            className={FULL}
          />
        </FilterField>
        <FilterField
          label="Place"
          hint={draft.areaIds.length === 1 ? undefined : "Pick exactly one area to choose a place."}
        >
          <FilterSelect
            label="Place"
            value={draft.placeId}
            onChange={(v) => set("placeId", v)}
            options={placeOptions}
            allLabel={draft.areaIds.length === 1 ? "All places" : "Place (pick one area)"}
            disabled={draft.areaIds.length !== 1 || placeOptions.length === 0}
            className={FULL}
          />
        </FilterField>
      </FilterGroup>

      <FilterGroup title="Team and status">
        <FilterField label="Agents">
          <MultiSelectField
            label="Agents"
            values={draft.agentIds}
            onChange={(v) => set("agentIds", v)}
            options={agents}
            allLabel="All agents"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Approval">
          <MultiSelectField
            label="Approval"
            values={draft.approvals}
            onChange={(v) => set("approvals", v as ApprovalStatus[])}
            options={(Object.keys(APPROVAL_LABELS) as ApprovalStatus[]).map((k) => ({
              value: k,
              label: APPROVAL_LABELS[k],
            }))}
            allLabel="Any approval"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Public website">
          <FilterSelect
            label="Public website"
            value={draft.published}
            onChange={(v) => set("published", v as PropertyFilterState["published"])}
            options={[
              { value: "yes", label: "On the website" },
              { value: "no", label: "Not on the website" },
            ]}
            allLabel="Either"
            className={FULL}
          />
        </FilterField>
        <FilterField label="Archive state">
          <SegmentedControl
            ariaLabel="Archive state"
            size="md"
            value={draft.archive}
            onChange={(v) => set("archive", v)}
            options={ARCHIVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FilterField>
      </FilterGroup>
    </FiltersDrawer>
  );
}
