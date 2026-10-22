// Property types: what staff can choose, and how the villa family is treated.
//
// "Villa" used to be one type. New properties choose Villa Standalone or Villa Compound. Properties already
// saved as plain "Villa" are not rewritten: they keep working, and show as a villa wherever villas are shown.

export const VILLA_STANDALONE = "Villa Standalone";
export const VILLA_COMPOUND = "Villa Compound";
export const LEGACY_VILLA = "Villa";

/** The types that can be chosen on a new or edited property. */
export const PROPERTY_TYPES = [
  "Apartment",
  VILLA_STANDALONE,
  VILLA_COMPOUND,
  "Townhouse",
  "Penthouse",
  "Plot",
  "Commercial",
] as const;

const VILLA_TYPES = new Set([VILLA_STANDALONE, VILLA_COMPOUND, LEGACY_VILLA].map((t) => t.toLowerCase()));

/** True for Villa Standalone, Villa Compound and the older plain Villa. */
export function isVillaType(type: string | null | undefined): boolean {
  return VILLA_TYPES.has((type ?? "").trim().toLowerCase());
}

/**
 * The options for a type field. A property still saved as plain "Villa" keeps showing it until someone picks
 * Standalone or Compound, so opening and saving it never changes the type silently.
 */
export function propertyTypeChoices(current?: string | null): string[] {
  const list: string[] = [...PROPERTY_TYPES];
  return current === LEGACY_VILLA ? [LEGACY_VILLA, ...list] : list;
}

/**
 * The stored types a type filter should match. Filtering for plain "Villa" means every kind of villa; a
 * specific kind matches only itself.
 */
export function typesForFilter(type: string): string[] {
  return type === LEGACY_VILLA ? [LEGACY_VILLA, VILLA_STANDALONE, VILLA_COMPOUND] : [type];
}

/** The options for a type filter: every type, plus "Villa" for all kinds of villa. */
export const PROPERTY_TYPE_FILTER_OPTIONS: string[] = [
  "Apartment",
  LEGACY_VILLA,
  VILLA_STANDALONE,
  VILLA_COMPOUND,
  "Townhouse",
  "Penthouse",
  "Plot",
  "Commercial",
];
