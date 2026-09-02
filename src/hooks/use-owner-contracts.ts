import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type ContractTemplate, type OwnerContract, type OwnerContractInsert, type OwnerContractUpdate } from "@/lib/db";

export const contractKeys = {
  templates: ["contract_templates"] as const,
  contracts: ["owner_contracts"] as const,
  byOwner: (ownerId: string) => ["owner_contracts", "owner", ownerId] as const,
};

export function useContractTemplates() {
  return useQuery({
    queryKey: contractKeys.templates,
    queryFn: async (): Promise<ContractTemplate[]> => {
      const { data, error } = await sb.from("contract_templates").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOwnerContracts(ownerId: string | undefined) {
  return useQuery({
    queryKey: ownerId ? contractKeys.byOwner(ownerId) : ["owner_contracts", "none"],
    enabled: !!ownerId,
    queryFn: async (): Promise<(OwnerContract & { properties: { title: string; reference_code: string | null } | null })[]> => {
      const { data, error } = await sb
        .from("owner_contracts")
        .select("*, properties(title, reference_code)")
        .eq("owner_id", ownerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (OwnerContract & { properties: { title: string; reference_code: string | null } | null })[];
    },
  });
}

/** All contracts with an expiry date - used by the Calendar module. */
export function useAllOwnerContracts() {
  return useQuery({
    queryKey: [...contractKeys.contracts, "all"],
    queryFn: async (): Promise<(OwnerContract & { owners: { name: string } | null; properties: { title: string } | null })[]> => {
      const { data, error } = await sb
        .from("owner_contracts")
        .select("*, owners(name), properties(title)")
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as (OwnerContract & { owners: { name: string } | null; properties: { title: string } | null })[];
    },
  });
}

export function useCreateOwnerContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OwnerContractInsert) => {
      const { data, error } = await sb.from("owner_contracts").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: contractKeys.contracts });
      if (d.owner_id) qc.invalidateQueries({ queryKey: contractKeys.byOwner(d.owner_id) });
    },
  });
}

export function useUpdateOwnerContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OwnerContractUpdate }) => {
      const { data, error } = await sb.from("owner_contracts").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: contractKeys.contracts });
      if (d.owner_id) qc.invalidateQueries({ queryKey: contractKeys.byOwner(d.owner_id) });
    },
  });
}

export function useDeleteOwnerContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("owner_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.contracts }),
  });
}

/** Expiring within the given number of days, still active (generated/signed). Used by the SMS reminder infrastructure and the dashboard. */
export function useExpiringOwnerContracts(withinDays = 30) {
  return useQuery({
    queryKey: ["owner_contracts", "expiring", withinDays],
    queryFn: async () => {
      const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await sb
        .from("owner_contracts")
        .select("*, owners(name, phone), properties(title, reference_code)")
        .in("status", ["generated", "signed"])
        .not("expiry_date", "is", null)
        .lte("expiry_date", cutoff)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
