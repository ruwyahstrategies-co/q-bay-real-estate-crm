import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Owner, type OwnerInsert, type OwnerUpdate } from "@/lib/db";

export const ownerKeys = {
  all: ["owners"] as const,
  list: (search?: string) => ["owners", "list", search ?? ""] as const,
  detail: (id: string) => ["owners", "detail", id] as const,
};

export function useOwners(search = "") {
  return useQuery({
    queryKey: ownerKeys.list(search),
    queryFn: async (): Promise<Owner[]> => {
      let q = sb.from("owners").select("*").order("name", { ascending: true });
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOwner(id: string | undefined) {
  return useQuery({
    queryKey: id ? ownerKeys.detail(id) : ["owners", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("owners").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useOwnerProperties(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["owners", "properties", ownerId ?? "none"],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await sb.from("properties").select("id, title, reference_code, status, price, currency").eq("owner_id", ownerId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOwnerDevelopments(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["owners", "developments", ownerId ?? "none"],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await sb.from("developments").select("id, name, slug, status, is_published").eq("owner_id", ownerId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOwnerTransactions(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["owners", "transactions", ownerId ?? "none"],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data: props, error: propsErr } = await sb.from("properties").select("id").eq("owner_id", ownerId!);
      if (propsErr) throw propsErr;
      const propertyIds = (props ?? []).map((p) => p.id);
      if (propertyIds.length === 0) return [];
      const { data, error } = await sb
        .from("transactions")
        .select("*, properties(title, reference_code)")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OwnerInsert) => {
      const { data, error } = await sb.from("owners").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ownerKeys.all }),
  });
}

export function useUpdateOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OwnerUpdate }) => {
      const { data, error } = await sb.from("owners").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ownerKeys.all });
      qc.invalidateQueries({ queryKey: ownerKeys.detail(vars.id) });
    },
  });
}

export function useDeleteOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("owners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ownerKeys.all }),
  });
}
