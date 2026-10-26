// Bulk property import: the template columns, and the checks every row goes through before anything is saved.
//
// Pure on purpose. The importer screen loads the lookups (owners, agents, locations, developments, approved
// developers), this file decides what each row means, and the database has the final word (permissions,
// approval routing, hierarchy and uniqueness rules all still apply to every insert).

import { PROPERTY_TYPES, LEGACY_VILLA } from "./property-types";

export type ImportFieldKey =
  | "title"
  | "purpose"
  | "property_type"
  | "owner"
  | "agent"
  | "country"
  | "area"
  | "place"
  | "location"
  | "development"
  | "developer"
  | "price"
  | "currency"
  | "bedrooms"
  | "bathrooms"
  | "size"
  | "size_unit"
  | "built_up_area"
  | "parking_spaces"
  | "furnishing_status"
  | "availability"
  | "description"
  | "reference_code"
  | "property_number";

export type ImportField = {
  key: ImportFieldKey;
  /** The column heading in the template (and what auto-matching looks for). */
  header: string;
  /** Required on every new property. An existing property being updated may leave it blank. */
  required: boolean;
  note: string;
  width: number;
};

export const PURPOSE_CHOICES = [
  { value: "sale", label: "Sale" },
  { value: "rent", label: "Rent" },
  { value: "commercial", label: "Commercial" },
  { value: "off_plan", label: "Off-Plan" },
  { value: "off_plan_resale", label: "Off-Plan Resale" },
] as const;

export const AVAILABILITY_CHOICES = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "rented", label: "Rented" },
  { value: "unavailable", label: "Unavailable" },
] as const;

export const CURRENCY_CHOICES = ["QAR", "AED", "USD", "EUR", "GBP"] as const;
export const SIZE_UNIT_CHOICES = ["sqm", "sqft"] as const;
export const FURNISHING_CHOICES = [
  { value: "FF", label: "FF" },
  { value: "SF", label: "SF" },
  { value: "UF", label: "UF" },
] as const;

export const IMPORT_FIELDS: ImportField[] = [
  { key: "title", header: "Title", required: true, width: 38, note: "The listing title." },
  {
    key: "purpose",
    header: "Purpose",
    required: true,
    width: 16,
    note: "Sale, Rent, Commercial, Off-Plan or Off-Plan Resale.",
  },
  {
    key: "property_type",
    header: "Property Type",
    required: true,
    width: 20,
    note: "Pick from the list. Villas are Villa Standalone or Villa Compound.",
  },
  {
    key: "owner",
    header: "Owner",
    required: true,
    width: 26,
    note: "The owner's name or owner code, exactly as it exists in the CRM.",
  },
  {
    key: "agent",
    header: "Assigned Agent",
    required: true,
    width: 26,
    note: "The agent's full name or email. Owner and agent together build the reference code.",
  },
  { key: "country", header: "Country", required: false, width: 16, note: "Pick from the list." },
  { key: "area", header: "Area", required: false, width: 20, note: "Must belong to the country." },
  { key: "place", header: "Place", required: false, width: 20, note: "Must belong to the area." },
  {
    key: "location",
    header: "Location Text",
    required: false,
    width: 28,
    note: "Optional wording shown on the listing. Left blank, it is built from Place and Area.",
  },
  {
    key: "development",
    header: "Development",
    required: false,
    width: 26,
    note: "Pick an existing development.",
  },
  {
    key: "developer",
    header: "Developer",
    required: false,
    width: 24,
    note: "Must be an approved developer (Settings).",
  },
  { key: "price", header: "Price", required: false, width: 14, note: "Numbers only." },
  { key: "currency", header: "Currency", required: false, width: 10, note: "QAR when left blank." },
  { key: "bedrooms", header: "Bedrooms", required: false, width: 10, note: "Whole number." },
  { key: "bathrooms", header: "Bathrooms", required: false, width: 10, note: "Whole number." },
  { key: "size", header: "Size", required: false, width: 10, note: "Numbers only." },
  { key: "size_unit", header: "Size Unit", required: false, width: 10, note: "sqm or sqft." },
  {
    key: "built_up_area",
    header: "Built-up Area",
    required: false,
    width: 14,
    note: "Numbers only, in square metres.",
  },
  {
    key: "parking_spaces",
    header: "Parking Spaces",
    required: false,
    width: 14,
    note: "Whole number.",
  },
  {
    key: "furnishing_status",
    header: "Furnishing",
    required: false,
    width: 12,
    note: "FF, SF or UF.",
  },
  {
    key: "availability",
    header: "Availability",
    required: false,
    width: 14,
    note: "Available when left blank.",
  },
  { key: "description", header: "Description", required: false, width: 50, note: "Free text." },
  {
    key: "reference_code",
    header: "Reference Code",
    required: false,
    width: 18,
    note: "Leave blank for new properties; the CRM issues it from the owner and agent. Fill it only to update an existing property.",
  },
  {
    key: "property_number",
    header: "Property Number",
    required: false,
    width: 16,
    note: "Leave blank for new properties; the CRM issues the next number (001, 002 ...). Fill it only to update an existing property.",
  },
];

/** The word used to compare names: lower case, accents and punctuation ignored, spaces collapsed. */
export function importNorm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ImportLookups = {
  countries: { id: string; name: string; is_active: boolean }[];
  areas: { id: string; name: string; country_id: string; is_active: boolean }[];
  places: { id: string; name: string; area_id: string; is_active: boolean }[];
  developments: { id: string; name: string }[];
  owners: { id: string; name: string; code: string | null }[];
  agents: { id: string; full_name: string; email: string | null; is_active: boolean }[];
  developers: { id: string; name: string; is_active: boolean }[];
};

export type ImportRowResult = {
  /** What would be saved. Only fields the file actually has a column for (blank cells on an update are left alone). */
  payload: Record<string, unknown>;
  errors: string[];
};

function numberOrError(
  text: string,
  label: string,
  errors: string[],
  opts: { integer?: boolean } = {},
): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a positive number (found "${text}").`);
    return null;
  }
  if (opts.integer && !Number.isInteger(n)) {
    errors.push(`${label} must be a whole number (found "${text}").`);
    return null;
  }
  return n;
}

function findUnique<T>(
  items: T[],
  pick: (t: T) => string[],
  wanted: string,
): { match: T | null; ambiguous: boolean } {
  const key = importNorm(wanted);
  const hits = items.filter((t) => pick(t).some((c) => importNorm(c) === key && key !== ""));
  if (hits.length === 1) return { match: hits[0], ambiguous: false };
  return { match: null, ambiguous: hits.length > 1 };
}

/**
 * Checks one row. `values` holds the cell text by field; `present` lists the fields the file has a column for.
 * `isUpdate` is true when the row's reference code belongs to an existing property.
 */
export function validatePropertyRow(
  values: Partial<Record<ImportFieldKey, string>>,
  present: Set<ImportFieldKey>,
  lookups: ImportLookups,
  isUpdate: boolean,
): ImportRowResult {
  const errors: string[] = [];
  const payload: Record<string, unknown> = {};
  const text = (k: ImportFieldKey) => String(values[k] ?? "").trim();
  const has = (k: ImportFieldKey) => present.has(k) && text(k) !== "";

  // Required on a new property.
  if (!isUpdate) {
    for (const f of IMPORT_FIELDS) {
      if (f.required && !has(f.key)) errors.push(`${f.header} is required.`);
    }
  }

  if (has("title")) {
    if (text("title").length > 200) errors.push("Title is longer than 200 characters.");
    payload.title = text("title");
  }

  if (has("purpose")) {
    const key = importNorm(text("purpose"));
    const hit = PURPOSE_CHOICES.find(
      (p) => importNorm(p.label) === key || importNorm(p.value) === key,
    );
    if (hit) payload.purpose = hit.value;
    else
      errors.push(
        `Purpose "${text("purpose")}" is not one of: ${PURPOSE_CHOICES.map((p) => p.label).join(", ")}.`,
      );
  }

  if (has("property_type")) {
    const typed = text("property_type");
    const hit = PROPERTY_TYPES.find((t) => importNorm(t) === importNorm(typed));
    if (hit) payload.property_type = hit;
    else if (importNorm(typed) === importNorm(LEGACY_VILLA))
      errors.push('Property Type "Villa" must be Villa Standalone or Villa Compound.');
    else errors.push(`Property Type "${typed}" is not one of: ${PROPERTY_TYPES.join(", ")}.`);
  }

  if (has("owner")) {
    const { match, ambiguous } = findUnique(
      lookups.owners,
      (o) => [o.name, o.code ?? ""],
      text("owner"),
    );
    if (match) payload.owner_id = match.id;
    else if (ambiguous)
      errors.push(
        `Owner "${text("owner")}" matches more than one owner. Use the owner code instead.`,
      );
    else
      errors.push(
        `Owner "${text("owner")}" was not found. Add the owner first, or check the spelling.`,
      );
  }

  if (has("agent")) {
    const { match, ambiguous } = findUnique(
      lookups.agents,
      (a) => [a.full_name, a.email ?? ""],
      text("agent"),
    );
    if (match && !match.is_active) errors.push(`Agent "${match.full_name}" is inactive.`);
    else if (match) payload.assigned_agent_id = match.id;
    else if (ambiguous)
      errors.push(
        `Agent "${text("agent")}" matches more than one team member. Use the email instead.`,
      );
    else errors.push(`Agent "${text("agent")}" was not found.`);
  }

  // Location: Country -> Area -> Place, each narrowing the one before it.
  let countryId: string | null = null;
  let areaId: string | null = null;
  let placeName = "";
  let areaName = "";
  if (has("country")) {
    const { match, ambiguous } = findUnique(lookups.countries, (c) => [c.name], text("country"));
    if (match) {
      if (!match.is_active) errors.push(`Country "${match.name}" is inactive.`);
      else countryId = match.id;
    } else
      errors.push(
        ambiguous
          ? `Country "${text("country")}" matches more than one country.`
          : `Country "${text("country")}" was not found.`,
      );
  }
  if (has("area")) {
    const pool = countryId
      ? lookups.areas.filter((a) => a.country_id === countryId)
      : lookups.areas;
    const { match, ambiguous } = findUnique(pool, (a) => [a.name], text("area"));
    if (match) {
      if (!match.is_active) errors.push(`Area "${match.name}" is inactive.`);
      else {
        areaId = match.id;
        areaName = match.name;
        if (!countryId) countryId = match.country_id;
      }
    } else if (ambiguous)
      errors.push(
        `Area "${text("area")}" exists in more than one country. Fill in the Country column too.`,
      );
    else if (countryId) errors.push(`Area "${text("area")}" was not found in ${text("country")}.`);
    else errors.push(`Area "${text("area")}" was not found.`);
  }
  if (has("place")) {
    if (!areaId) {
      errors.push("Place needs a valid Area on the same row.");
    } else {
      const { match, ambiguous } = findUnique(
        lookups.places.filter((p) => p.area_id === areaId),
        (p) => [p.name],
        text("place"),
      );
      if (match) {
        if (!match.is_active) errors.push(`Place "${match.name}" is inactive.`);
        else {
          payload.place_id = match.id;
          placeName = match.name;
        }
      } else
        errors.push(
          ambiguous
            ? `Place "${text("place")}" matches more than one place in ${areaName}.`
            : `Place "${text("place")}" was not found in ${areaName}.`,
        );
    }
  }
  if (countryId) payload.country_id = countryId;
  if (areaId) payload.area_id = areaId;

  if (has("location")) payload.location = text("location");
  else if (!isUpdate && (placeName || areaName))
    payload.location = [placeName, areaName].filter(Boolean).join(", ");

  if (has("development")) {
    const { match, ambiguous } = findUnique(
      lookups.developments,
      (d) => [d.name],
      text("development"),
    );
    if (match) payload.development_id = match.id;
    else
      errors.push(
        ambiguous
          ? `Development "${text("development")}" matches more than one development.`
          : `Development "${text("development")}" was not found.`,
      );
  }

  if (has("developer")) {
    const { match } = findUnique(lookups.developers, (d) => [d.name], text("developer"));
    if (!match)
      errors.push(
        `Developer "${text("developer")}" is not an approved developer. An administrator can add it in Settings.`,
      );
    else if (!match.is_active)
      errors.push(`Developer "${match.name}" is inactive. Ask an administrator to reactivate it.`);
    else {
      payload.developer = match.name;
      payload.developer_id = match.id;
    }
  }

  if (has("price")) {
    const n = numberOrError(text("price"), "Price", errors);
    if (n != null) payload.price = n;
  }
  if (has("currency")) {
    const hit = CURRENCY_CHOICES.find((c) => c === text("currency").toUpperCase());
    if (hit) payload.currency = hit;
    else
      errors.push(`Currency "${text("currency")}" is not one of: ${CURRENCY_CHOICES.join(", ")}.`);
  } else if (!isUpdate) payload.currency = "QAR";

  for (const [key, label] of [
    ["bedrooms", "Bedrooms"],
    ["bathrooms", "Bathrooms"],
    ["parking_spaces", "Parking Spaces"],
  ] as const) {
    if (has(key)) {
      const n = numberOrError(text(key), label, errors, { integer: true });
      if (n != null) payload[key] = n;
    }
  }
  for (const [key, label] of [
    ["size", "Size"],
    ["built_up_area", "Built-up Area"],
  ] as const) {
    if (has(key)) {
      const n = numberOrError(text(key), label, errors);
      if (n != null) payload[key] = n;
    }
  }

  if (has("size_unit")) {
    const hit = SIZE_UNIT_CHOICES.find((u) => u === text("size_unit").toLowerCase());
    if (hit) payload.size_unit = hit;
    else errors.push(`Size Unit "${text("size_unit")}" must be sqm or sqft.`);
  }
  if (has("furnishing_status")) {
    const hit = FURNISHING_CHOICES.find((f) => f.value === text("furnishing_status").toUpperCase());
    if (hit) payload.furnishing_status = hit.value;
    else errors.push(`Furnishing "${text("furnishing_status")}" must be FF, SF or UF.`);
  }
  if (has("availability")) {
    const key = importNorm(text("availability"));
    const hit = AVAILABILITY_CHOICES.find(
      (a) => importNorm(a.label) === key || importNorm(a.value) === key,
    );
    if (hit) payload.availability = hit.value;
    else
      errors.push(
        `Availability "${text("availability")}" is not one of: ${AVAILABILITY_CHOICES.map((a) => a.label).join(", ")}.`,
      );
  } else if (!isUpdate) payload.availability = "available";

  if (has("description")) payload.description = text("description");

  return { payload, errors };
}

/** Matches a file's column headings to the template fields, tolerating case, spacing and punctuation. */
export function autoMatchColumns(headers: string[]): Partial<Record<ImportFieldKey, string>> {
  const map: Partial<Record<ImportFieldKey, string>> = {};
  const used = new Set<string>();
  const aliases: Partial<Record<ImportFieldKey, string[]>> = {
    agent: ["agent", "assigned agent"],
    property_type: ["property type", "type"],
    location: ["location text", "location"],
    furnishing_status: ["furnishing", "furnishing status"],
    built_up_area: ["built up area", "builtup area"],
    reference_code: ["reference code", "reference", "ref"],
    property_number: ["property number", "property no", "number", "no"],
  };
  for (const f of IMPORT_FIELDS) {
    const wanted = [f.header, f.key.replace(/_/g, " "), ...(aliases[f.key] ?? [])].map(importNorm);
    const hit = headers.find((h) => !used.has(h) && wanted.includes(importNorm(h)));
    if (hit) {
      map[f.key] = hit;
      used.add(hit);
    }
  }
  return map;
}
