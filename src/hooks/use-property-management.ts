import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOwnerPhones } from "@/lib/owner-privacy";
import {
  sb,
  type PropertyLease,
  type PropertyLeaseInsert,
  type Tenant,
  type TenantInsert,
  type RentScheduleItem,
  type RentScheduleItemInsert,
  type RentPayment,
  type RentPaymentInsert,
  type MaintenanceIssue,
  type MaintenanceIssueInsert,
  type MaintenanceIssueUpdate,
} from "@/lib/db";

const pmKeys = {
  managedProperties: ["property-management", "properties"] as const,
  tenancies: ["property-management", "tenancies"] as const,
  tenants: ["property-management", "tenants"] as const,
  schedule: ["property-management", "rent-schedule"] as const,
  payments: ["property-management", "rent-payments"] as const,
  maintenance: ["property-management", "maintenance"] as const,
};

export function useManagedProperties() {
  return useQuery({
    queryKey: pmKeys.managedProperties,
    queryFn: async () => {
      const { data, error } = await sb
        .from("properties")
        .select("*, owners(name, email)")
        .eq("is_managed", true)
        .order("title");
      if (error) throw error;
      // Phones come from the authorization-checked RPC, never from a joined owners select.
      const rows = data ?? [];
      const phones = await fetchOwnerPhones(rows.map((r) => r.owner_id).filter((id): id is string => !!id));
      return rows.map((r) => ({
        ...r,
        owners: r.owners ? { ...r.owners, phone: (r.owner_id && phones.get(r.owner_id)) || null } : r.owners,
      }));
    },
  });
}

export function useTenancies() {
  return useQuery({
    queryKey: pmKeys.tenancies,
    queryFn: async (): Promise<
      (PropertyLease & {
        properties: { title: string; reference_code: string | null } | null;
        tenants: Tenant | null;
      })[]
    > => {
      const { data, error } = await sb
        .from("property_leases")
        .select("*, properties(title, reference_code), tenants(*)")
        .order("lease_end", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as (PropertyLease & {
        properties: { title: string; reference_code: string | null } | null;
        tenants: Tenant | null;
      })[];
    },
  });
}

export function useTenants(search = "") {
  return useQuery({
    queryKey: [...pmKeys.tenants, search],
    queryFn: async (): Promise<Tenant[]> => {
      let q = sb.from("tenants").select("*").order("full_name");
      if (search.trim()) q = q.ilike("full_name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTenant(id: string | null) {
  return useQuery({
    queryKey: [...pmKeys.tenants, "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await sb.from("tenants").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TenantInsert) => {
      const { data, error } = await sb.from("tenants").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.tenants }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Tenant> }) => {
      const { data, error } = await sb.from("tenants").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pmKeys.tenants });
      qc.invalidateQueries({ queryKey: pmKeys.tenancies });
    },
  });
}

export function useCreateTenancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PropertyLeaseInsert) => {
      const { data, error } = await sb.from("property_leases").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.tenancies }),
  });
}

export function useUpdateTenancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PropertyLease> }) => {
      const { data, error } = await sb
        .from("property_leases")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.tenancies }),
  });
}

export function useRentSchedule(leaseId?: string) {
  return useQuery({
    queryKey: leaseId ? [...pmKeys.schedule, leaseId] : pmKeys.schedule,
    queryFn: async (): Promise<
      (RentScheduleItem & {
        property_leases: { property_id: string; properties: { title: string } | null } | null;
      })[]
    > => {
      let q = sb
        .from("rent_schedule_items")
        .select("*, property_leases(property_id, properties(title))")
        .order("due_date", { ascending: true });
      if (leaseId) q = q.eq("property_lease_id", leaseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (RentScheduleItem & {
        property_leases: { property_id: string; properties: { title: string } | null } | null;
      })[];
    },
  });
}

/** Refreshes `overdue` status server-side so the figure matches the persisted record, not just this render's clock. */
export function useMarkOverdueRentItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("mark_overdue_rent_items");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (touched) => {
      if (touched > 0) qc.invalidateQueries({ queryKey: pmKeys.schedule });
    },
  });
}

export function useGenerateRentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lease, months }: { lease: PropertyLease; months: number }) => {
      if (!lease.lease_start || !lease.rent_amount)
        throw new Error("Lease needs a start date and rent amount first");
      const freq = lease.payment_frequency ?? "monthly";
      const stepMonths =
        freq === "monthly" ? 1 : freq === "quarterly" ? 3 : freq === "biannual" ? 6 : 12;
      const perInstallment = stepMonths === 1 ? lease.rent_amount : lease.rent_amount * stepMonths;
      const start = new Date(lease.lease_start);
      const items: RentScheduleItemInsert[] = [];
      for (let i = 0; i < months; i += stepMonths) {
        const due = new Date(start);
        due.setMonth(due.getMonth() + i);
        items.push({
          property_lease_id: lease.id,
          due_date: due.toISOString().slice(0, 10),
          amount: perInstallment,
          currency: lease.currency ?? "QAR",
          status: "due",
        });
      }
      // A unique (lease, due_date) index means re-generating an overlapping
      // schedule fails cleanly instead of silently doubling every installment.
      const { error } = await sb.from("rent_schedule_items").insert(items);
      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "A schedule already covers part of this period. Check Rent Schedule before generating again.",
          );
        }
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.schedule }),
  });
}

export function useRentPayments(leaseId?: string) {
  return useQuery({
    queryKey: leaseId ? [...pmKeys.payments, leaseId] : pmKeys.payments,
    queryFn: async (): Promise<RentPayment[]> => {
      let q = sb.from("rent_payments").select("*").order("received_date", { ascending: false });
      if (leaseId) q = q.eq("property_lease_id", leaseId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecordRentPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RentPaymentInsert) => {
      const { data, error } = await sb.from("rent_payments").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pmKeys.payments });
      qc.invalidateQueries({ queryKey: pmKeys.schedule });
    },
  });
}

/* ------------------------------ Maintenance ------------------------------ */

export function useMaintenanceIssues(propertyId?: string) {
  return useQuery({
    queryKey: propertyId ? [...pmKeys.maintenance, propertyId] : pmKeys.maintenance,
    queryFn: async (): Promise<
      (MaintenanceIssue & { properties: { title: string; reference_code: string | null } | null })[]
    > => {
      let q = sb
        .from("property_maintenance_issues")
        .select("*, properties(title, reference_code)")
        .order("reported_at", { ascending: false });
      if (propertyId) q = q.eq("property_id", propertyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (MaintenanceIssue & {
        properties: { title: string; reference_code: string | null } | null;
      })[];
    },
  });
}

export function useCreateMaintenanceIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MaintenanceIssueInsert) => {
      const { data, error } = await sb
        .from("property_maintenance_issues")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.maintenance }),
  });
}

export function useUpdateMaintenanceIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MaintenanceIssueUpdate }) => {
      const { data, error } = await sb
        .from("property_maintenance_issues")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.maintenance }),
  });
}
