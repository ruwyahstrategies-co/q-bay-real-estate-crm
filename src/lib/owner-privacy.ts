import { sb } from "@/lib/db";
import type { Owner, PropertySubmission } from "@/lib/db";

/**
 * Every owners column except the private ones (phone, id_number). The database does not
 * let client roles read those directly, so any query against owners must list columns
 * explicitly (select("*") is rejected) and obtain private fields through the RPCs below.
 */
export const OWNER_COLUMNS =
  "id, name, company, email, notes, created_at, updated_at, code, is_developer, address, assigned_agent_id, source_lead_id, is_demo";

export const OWNER_PHONE_HIDDEN_LABEL = "Hidden";

/**
 * An owner row where phone and id_number are only populated when the caller is entitled
 * to them. phone_hidden is true when the server withheld them.
 */
export type SafeOwner = Owner & { phone_hidden: boolean; id_number_hidden: boolean };

type OwnerWithoutPrivate = Omit<Owner, "phone" | "id_number">;

const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

/** Phones the caller may see. Owners the caller may not see are absent from the map. */
export async function fetchOwnerPhones(ownerIds: string[]): Promise<Map<string, string | null>> {
  const ids = uniqueIds(ownerIds);
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  const { data, error } = await sb.rpc("get_owner_phones", { _owner_ids: ids });
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.owner_id, row.phone);
  }
  return map;
}

/** Phone and id_number the caller may see. Owners the caller may not see are absent. */
export async function fetchOwnerPrivateFields(
  ownerIds: string[],
): Promise<Map<string, { phone: string | null; id_number: string | null }>> {
  const ids = uniqueIds(ownerIds);
  const map = new Map<string, { phone: string | null; id_number: string | null }>();
  if (ids.length === 0) return map;
  const { data, error } = await sb.rpc("get_owner_private_fields", { _owner_ids: ids });
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.owner_id, { phone: row.phone, id_number: row.id_number });
  }
  return map;
}

/**
 * Every property_submissions column except owner_id_number, which is a second copy of the owner's
 * national ID and follows the same access rule. The database rejects select("*") on this table.
 */
export const SUBMISSION_COLUMNS =
  "id, website_profile_id, full_name, phone, email, country_id, area_id, location, property_type, purpose, price, currency, bedrooms, bathrooms, size, description, media, documents, status, reviewed_by, review_notes, converted_property_id, submitted_at, last_refreshed_at, created_at, updated_at, tower_name, floor_number, unit_number, parking_spaces, furnishing_status, owner_id, development_id, source, terms_accepted, custom_area, available_from, place_id";

/** A submission where owner_id_number is only populated when the caller is entitled to it. */
export type SafeSubmission = PropertySubmission & { id_number_hidden?: boolean };

export async function attachSubmissionIdNumbers(
  rows: Omit<PropertySubmission, "owner_id_number">[],
): Promise<SafeSubmission[]> {
  const ids = uniqueIds(rows.map((r) => r.id));
  const visible = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data, error } = await sb.rpc("get_submission_id_numbers", { _ids: ids });
    if (error) throw error;
    for (const row of data ?? []) visible.set(row.submission_id, row.owner_id_number);
  }
  return rows.map((r) => ({
    ...r,
    owner_id_number: visible.get(r.id) ?? null,
    id_number_hidden: !visible.has(r.id),
  }));
}

export async function attachOwnerPrivateFields(rows: OwnerWithoutPrivate[]): Promise<SafeOwner[]> {
  const priv = await fetchOwnerPrivateFields(rows.map((r) => r.id));
  return rows.map((r) => {
    const p = priv.get(r.id);
    return {
      ...r,
      phone: p?.phone ?? null,
      id_number: p?.id_number ?? null,
      phone_hidden: !p,
      id_number_hidden: !p,
    };
  });
}
