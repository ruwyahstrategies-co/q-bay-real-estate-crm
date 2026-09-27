-- Tenant id_number lockdown. Apply ONLY after the CRM build that reads tenants through
-- explicit columns (TENANT_COLUMNS) and gets ID numbers through get_tenant_private_fields()
-- is deployed. select("*") on tenants, and tenants(*) embedded in other selects, is rejected
-- from here on, so applying this first would break the Tenants and Tenancies tabs in the
-- previous build.
--
-- Client roles lose direct SELECT on tenants.id_number. Every other column stays readable under
-- the existing tenants_select policy. service_role and SECURITY DEFINER functions are unaffected.

revoke select on public.tenants from anon, authenticated;
grant select (
  id, full_name, phone, email, notes, created_at, updated_at,
  nationality, is_demo, created_by
) on public.tenants to authenticated;
