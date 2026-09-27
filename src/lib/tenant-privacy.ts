import { sb } from "@/lib/db";
import type { Tenant } from "@/lib/db";

/**
 * Every tenants column except id_number. The ID / passport number is only released by
 * get_tenant_private_fields() to administrators, the person who created the tenant and the
 * agent of a property the tenant rents. Once the database lockdown is applied, select("*") on
 * tenants (and tenants(*) embedded in another select) is rejected, so queries list columns.
 */
export const TENANT_COLUMNS =
  "id, full_name, phone, email, notes, created_at, updated_at, nationality, is_demo, created_by";

/** A tenant as returned by list and profile queries: everything except the ID number. */
export type TenantRecord = Omit<Tenant, "id_number">;

/** The ID number of one tenant, or visible=false when the caller may not see it. */
export async function fetchTenantIdNumber(
  tenantId: string,
): Promise<{ value: string | null; visible: boolean }> {
  const { data, error } = await sb.rpc("get_tenant_private_fields", { _tenant_ids: [tenantId] });
  if (error) throw error;
  const row = (data ?? []).find((r) => r.tenant_id === tenantId);
  return row ? { value: row.id_number ?? null, visible: true } : { value: null, visible: false };
}
