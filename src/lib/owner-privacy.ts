import { sb } from "@/lib/db";
import type { Owner } from "@/lib/db";

/**
 * Every owners column except phone. The database no longer lets client roles read
 * owners.phone directly, so any query against owners must list columns explicitly
 * (select("*") is rejected) and obtain phones through get_owner_phones().
 */
export const OWNER_COLUMNS =
  "id, name, company, email, notes, created_at, updated_at, code, is_developer, address, assigned_agent_id, source_lead_id, is_demo, id_number";

export const OWNER_PHONE_HIDDEN_LABEL = "Hidden";

/** An owner row where phone is only populated when the caller is entitled to it. */
export type SafeOwner = Owner & { phone_hidden: boolean };

type OwnerWithoutPhone = Omit<Owner, "phone">;

/** Fetches phones the caller may see. Owners the caller may not see are absent from the map. */
export async function fetchOwnerPhones(ownerIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(ownerIds.filter(Boolean)));
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  // Cast until src/integrations/supabase/types.ts is regenerated to include this RPC.
  const rpc = sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
  const { data, error } = await rpc.call(sb, "get_owner_phones", { _owner_ids: ids });
  if (error) throw error;
  for (const row of (data ?? []) as { owner_id: string; phone: string | null }[]) {
    map.set(row.owner_id, row.phone);
  }
  return map;
}

export async function attachOwnerPhones(rows: OwnerWithoutPhone[]): Promise<SafeOwner[]> {
  const phones = await fetchOwnerPhones(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    phone: phones.get(r.id) ?? null,
    phone_hidden: !phones.has(r.id),
  }));
}
