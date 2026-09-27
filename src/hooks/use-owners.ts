import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type OwnerInsert, type OwnerUpdate } from "@/lib/db";
import { OWNER_COLUMNS, attachOwnerPrivateFields, type SafeOwner } from "@/lib/owner-privacy";

export const ownerKeys = {
  all: ["owners"] as const,
  list: (search?: string) => ["owners", "list", search ?? ""] as const,
  detail: (id: string) => ["owners", "detail", id] as const,
};

/** How many owners a search returns at most (the rest are found by typing more). */
const OWNER_SEARCH_LIMIT = 100;

/**
 * Owners list. With a search term the matching happens in the database (search_owner_ids): it
 * covers name, company, code, email and phone number, but a phone number only counts for owners
 * whose phone the signed-in user is allowed to see. The browser never receives phones to filter
 * on, and typing a hidden owner's number finds nothing.
 */
export function useOwners(search = "") {
  const term = search.trim();
  return useQuery({
    queryKey: ownerKeys.list(term),
    queryFn: async (): Promise<SafeOwner[]> => {
      let q = sb.from("owners").select(OWNER_COLUMNS).order("name", { ascending: true });
      if (term) {
        const { data: matches, error: searchError } = await sb.rpc("search_owner_ids", {
          _query: term,
          _limit: OWNER_SEARCH_LIMIT,
        });
        if (searchError) throw searchError;
        const ids = (matches ?? []).map((m) => m.owner_id);
        if (ids.length === 0) return [];
        q = q.in("id", ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return attachOwnerPrivateFields((data ?? []) as never);
    },
  });
}

export function useOwner(id: string | undefined) {
  return useQuery({
    queryKey: id ? ownerKeys.detail(id) : ["owners", "detail", "none"],
    enabled: !!id,
    queryFn: async (): Promise<SafeOwner | null> => {
      const { data, error } = await sb.from("owners").select(OWNER_COLUMNS).eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [owner] = await attachOwnerPrivateFields([data as never]);
      return owner;
    },
  });
}

export function useOwnerProperties(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["owners", "properties", ownerId ?? "none"],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("properties")
        .select("id, title, reference_code, status, price, currency")
        .eq("owner_id", ownerId!);
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
      const { data, error } = await sb
        .from("developments")
        .select("id, name, slug, status, is_published")
        .eq("owner_id", ownerId!);
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
      const { data: props, error: propsErr } = await sb
        .from("properties")
        .select("id")
        .eq("owner_id", ownerId!);
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
      const { data, error } = await sb.from("owners").insert(input).select(OWNER_COLUMNS).single();
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
      const { data, error } = await sb.from("owners").update(patch).eq("id", id).select(OWNER_COLUMNS).single();
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
