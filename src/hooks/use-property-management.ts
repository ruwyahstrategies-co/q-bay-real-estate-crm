import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@/lib/db";

const pmKeys = {
  managedProperties: ["property-management", "properties"] as const,
  tenancies: ["property-management", "tenancies"] as const,
  tenants: ["property-management", "tenants"] as const,
  schedule: ["property-management", "rent-schedule"] as const,
  payments: ["property-management", "rent-payments"] as const,
};

export function useManagedProperties() {
  return useQuery({
    queryKey: pmKeys.managedProperties,
    queryFn: async () => {
      const { data, error } = await sb.from("properties").select("*, owners(name)").eq("is_managed", true).order("title");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTenancies() {
  return useQuery({
    queryKey: pmKeys.tenancies,
    queryFn: async (): Promise<(PropertyLease & { properties: { title: string; reference_code: string | null } | null; tenants: Tenant | null })[]> => {
      const { data, error } = await sb
        .from("property_leases")
        .select("*, properties(title, reference_code), tenants(*)")
        .order("lease_end", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as (PropertyLease & { properties: { title: string; reference_code: string | null } | null; tenants: Tenant | null })[];
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
      const { data, error } = await sb.from("property_leases").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pmKeys.tenancies }),
  });
}

export function useRentSchedule(leaseId?: string) {
  return useQuery({
    queryKey: leaseId ? [...pmKeys.schedule, leaseId] : pmKeys.schedule,
    queryFn: async (): Promise<(RentScheduleItem & { property_leases: { property_id: string; properties: { title: string } | null } | null })[]> => {
      let q = sb.from("rent_schedule_items").select("*, property_leases(property_id, properties(title))").order("due_date", { ascending: true });
      if (leaseId) q = q.eq("property_lease_id", leaseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (RentScheduleItem & { property_leases: { property_id: string; properties: { title: string } | null } | null })[];
    },
  });
}

export function useGenerateRentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lease, months }: { lease: PropertyLease; months: number }) => {
      if (!lease.lease_start || !lease.rent_amount) throw new Error("Lease needs a start date and rent amount first");
      const freq = lease.payment_frequency ?? "monthly";
      const stepMonths = freq === "monthly" ? 1 : freq === "quarterly" ? 3 : freq === "biannual" ? 6 : 12;
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
      const { error } = await sb.from("rent_schedule_items").insert(items);
      if (error) throw error;
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
