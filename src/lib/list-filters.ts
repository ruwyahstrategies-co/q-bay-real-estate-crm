// The filter sets behind the Leads and Properties Filters drawers.
//
// Each page holds one "applied" filter object. The drawer edits a draft copy and only replaces the applied
// one on Apply, so half-chosen filters never fire a query. Reset clears everything. The numbers shown on the
// Filters button and in the chips come from the same object the query is built from, so they cannot disagree.
// Every filter is sent to the database; nothing is filtered in the browser.

import type { LeadFilters } from "@/hooks/use-leads";
import type { PropertyFilters, ApprovalStatus } from "@/hooks/use-properties";

/** A typed number box. Empty or not a number means "no limit". */
export function parseAmount(text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Empty means "not filtered". Used by both drawers for the amount ranges. */
export function rangeProblem(fromText: string, toText: string, noun: string): string | null {
  const from = parseAmount(fromText);
  const to = parseAmount(toText);
  if (from != null && to != null && from > to) {
    return `The minimum ${noun} is higher than the maximum, so the ${noun} filter is not applied.`;
  }
  return null;
}

export function dateRangeProblem(from: string, to: string): string | null {
  if (from && to && from > to)
    return "The start date is after the end date, so the date filter is not applied.";
  return null;
}

// ---------------------------------------------------------------- Leads

export type LeadFilterState = {
  stages: string[];
  /** Agent ids, plus UNASSIGNED_AGENT for leads nobody owns. */
  agents: string[];
  classifications: string[];
  workflow: string | null;
  developmentIds: string[];
  sources: string[];
  countryId: string | null;
  areaIds: string[];
  createdFrom: string;
  createdTo: string;
  budgetMin: string;
  budgetMax: string;
  outcome: string | null;
  customKey: string | null;
  customValue: string | null;
};

export const EMPTY_LEAD_FILTERS: LeadFilterState = {
  stages: [],
  agents: [],
  classifications: [],
  workflow: null,
  developmentIds: [],
  sources: [],
  countryId: null,
  areaIds: [],
  createdFrom: "",
  createdTo: "",
  budgetMin: "",
  budgetMax: "",
  outcome: null,
  customKey: null,
  customValue: null,
};

/** How many filters are on. A group of several choices (three stages) counts once. */
export function leadFilterCount(f: LeadFilterState): number {
  return (
    (f.stages.length ? 1 : 0) +
    (f.agents.length ? 1 : 0) +
    (f.classifications.length ? 1 : 0) +
    (f.workflow ? 1 : 0) +
    (f.developmentIds.length ? 1 : 0) +
    (f.sources.length ? 1 : 0) +
    (f.countryId ? 1 : 0) +
    (f.areaIds.length ? 1 : 0) +
    (f.createdFrom ? 1 : 0) +
    (f.createdTo ? 1 : 0) +
    (f.budgetMin.trim() ? 1 : 0) +
    (f.budgetMax.trim() ? 1 : 0) +
    (f.outcome ? 1 : 0) +
    (f.customKey && f.customValue ? 1 : 0)
  );
}

export function leadFilterProblems(f: LeadFilterState): string[] {
  return [
    rangeProblem(f.budgetMin, f.budgetMax, "budget"),
    dateRangeProblem(f.createdFrom, f.createdTo),
  ].filter(Boolean) as string[];
}

/** The query options for a filter set. A contradictory range is left out rather than returning nothing. */
export function leadQueryFrom(
  f: LeadFilterState,
  customFieldType: string | null,
): Pick<
  LeadFilters,
  | "stages"
  | "agents"
  | "classifications"
  | "workflow"
  | "developmentIds"
  | "sources"
  | "countryId"
  | "areaIds"
  | "createdFrom"
  | "createdTo"
  | "budgetMin"
  | "budgetMax"
  | "outcome"
  | "customField"
> {
  const budgetBad = rangeProblem(f.budgetMin, f.budgetMax, "budget") != null;
  const datesBad = dateRangeProblem(f.createdFrom, f.createdTo) != null;
  return {
    stages: f.stages,
    agents: f.agents,
    classifications: f.classifications,
    workflow: f.workflow,
    developmentIds: f.developmentIds,
    sources: f.sources,
    countryId: f.countryId,
    areaIds: f.areaIds,
    createdFrom: datesBad ? null : f.createdFrom || null,
    createdTo: datesBad ? null : f.createdTo || null,
    budgetMin: budgetBad ? null : parseAmount(f.budgetMin),
    budgetMax: budgetBad ? null : parseAmount(f.budgetMax),
    outcome: f.outcome,
    customField:
      f.customKey && f.customValue && customFieldType
        ? { key: f.customKey, type: customFieldType, value: f.customValue }
        : null,
  };
}

// ----------------------------------------------------------- Properties

export type PropertyFilterState = {
  types: string[];
  availabilities: string[];
  minPrice: string;
  maxPrice: string;
  minBedrooms: string | null;
  furnishing: string | null;
  developmentIds: string[];
  countryId: string | null;
  areaIds: string[];
  placeId: string | null;
  agentIds: string[];
  approvals: ApprovalStatus[];
  published: "yes" | "no" | null;
  archive: "active" | "archived" | "all";
};

export const EMPTY_PROPERTY_FILTERS: PropertyFilterState = {
  types: [],
  availabilities: [],
  minPrice: "",
  maxPrice: "",
  minBedrooms: null,
  furnishing: null,
  developmentIds: [],
  countryId: null,
  areaIds: [],
  placeId: null,
  agentIds: [],
  approvals: [],
  published: null,
  archive: "active",
};

export function propertyFilterCount(f: PropertyFilterState): number {
  return (
    (f.types.length ? 1 : 0) +
    (f.availabilities.length ? 1 : 0) +
    (f.minPrice.trim() ? 1 : 0) +
    (f.maxPrice.trim() ? 1 : 0) +
    (f.minBedrooms ? 1 : 0) +
    (f.furnishing ? 1 : 0) +
    (f.developmentIds.length ? 1 : 0) +
    (f.countryId ? 1 : 0) +
    (f.areaIds.length ? 1 : 0) +
    (f.placeId ? 1 : 0) +
    (f.agentIds.length ? 1 : 0) +
    (f.approvals.length ? 1 : 0) +
    (f.published ? 1 : 0) +
    (f.archive !== "active" ? 1 : 0)
  );
}

export function propertyFilterProblems(f: PropertyFilterState): string[] {
  return [rangeProblem(f.minPrice, f.maxPrice, "price")].filter(Boolean) as string[];
}

export function propertyQueryFrom(
  f: PropertyFilterState,
): Omit<PropertyFilters, "search" | "purpose"> {
  const priceBad = rangeProblem(f.minPrice, f.maxPrice, "price") != null;
  return {
    types: f.types,
    availabilities: f.availabilities,
    status: f.archive,
    minPrice: priceBad ? null : parseAmount(f.minPrice),
    maxPrice: priceBad ? null : parseAmount(f.maxPrice),
    minBedrooms: f.minBedrooms ? Number(f.minBedrooms) : null,
    furnishing: f.furnishing,
    developmentIds: f.developmentIds,
    countryId: f.countryId,
    areaIds: f.areaIds,
    placeId: f.areaIds.length === 1 ? f.placeId : null,
    agentIds: f.agentIds,
    approvals: f.approvals,
    published: f.published === null ? null : f.published === "yes",
  };
}
