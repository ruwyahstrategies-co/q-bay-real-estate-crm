// Approved Developer / Company lists (Settings > Developers & Companies).
//
// Operational forms select from these lists instead of typing. A record keeps BOTH the link
// (developer_id / company_id) and the legacy text column, so older records, the public website
// and exports keep working. This file holds the pure logic shared by every form that uses a list.

import type { MasterDataValue } from "@/lib/db";

export type MasterKind = "developer" | "company";

export const MASTER_KIND_LABELS: Record<MasterKind, { singular: string; plural: string }> = {
  developer: { singular: "Developer", plural: "Developers" },
  company: { singular: "Company", plural: "Companies" },
};

/** Select value used for a record whose stored text never matched an approved value. */
export const LEGACY_VALUE = "__legacy__";

export type MasterOption = { value: string; label: string };

export type MasterCurrent = {
  /** The approved value the record is linked to, if any. */
  id?: string | null;
  /** The record's stored text (developments.developer, owners.company, ...). */
  text?: string | null;
};

/**
 * Options for a form select: every ACTIVE approved value, plus whatever the record already has
 * so historical data stays visible and re-savable:
 *  - linked to a value that was later deactivated -> that value, labelled "(inactive)";
 *  - stored text that never matched an approved value -> that text, labelled "(not in list)".
 * New selection of inactive values is not offered (the database refuses it as well).
 */
export function buildMasterOptions(values: MasterDataValue[], current?: MasterCurrent): MasterOption[] {
  const options: MasterOption[] = values
    .filter((v) => v.is_active)
    .sort(byOrderThenName)
    .map((v) => ({ value: v.id, label: v.name }));

  if (current?.id && !options.some((o) => o.value === current.id)) {
    const linked = values.find((v) => v.id === current.id);
    if (linked) options.unshift({ value: linked.id, label: `${linked.name} (inactive)` });
  }
  if (!current?.id && current?.text?.trim()) {
    options.unshift({ value: LEGACY_VALUE, label: `${current.text.trim()} (not in list)` });
  }
  return options;
}

/** Initial select value for a record: its link, else the legacy marker, else empty. */
export function initialMasterSelection(current?: MasterCurrent): string {
  if (current?.id) return current.id;
  if (current?.text?.trim()) return LEGACY_VALUE;
  return "";
}

/**
 * Turns a form selection back into the pair to save. Legacy text is written back unchanged so
 * saving an old record never erases it; picking an approved value writes its canonical name.
 */
export function resolveMasterSelection(
  selection: string | null | undefined,
  values: MasterDataValue[],
  legacyText?: string | null,
): { id: string | null; text: string | null } {
  if (!selection) return { id: null, text: null };
  if (selection === LEGACY_VALUE) return { id: null, text: legacyText?.trim() ? legacyText : null };
  const found = values.find((v) => v.id === selection);
  return found ? { id: found.id, text: found.name } : { id: null, text: null };
}

/** Options for a filter: every approved value (inactive ones too, records still carry them). */
export function buildMasterFilterOptions(values: MasterDataValue[]): MasterOption[] {
  return [...values].sort(byOrderThenName).map((v) => ({
    value: v.id,
    label: v.is_active ? v.name : `${v.name} (inactive)`,
  }));
}

function byOrderThenName(a: MasterDataValue, b: MasterDataValue): number {
  return a.display_order - b.display_order || a.name.localeCompare(b.name);
}
