import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type OwnerInsert, type OwnerUpdate } from "@/lib/db";
import { OWNER_COLUMNS, attachOwnerPrivateFields, type SafeOwner } from "@/lib/owner-privacy";

export const ownerKeys = {
  all: ["owners"] as const,
  list: (filters?: Record<string, unknown>) => ["owners", "list", filters ?? {}] as const,
  options: ["owners", "options"] as const,
  detail: (id: string) => ["owners", "detail", id] as const,
};

/** Structured Owners filters. Each maps to one non-private owners column. */
export type OwnerFilters = {
  /** Secure text search (name, company, code, email; phone only where the viewer may see it). */
  search?: string;
  /** owners.is_developer: true = Developer, false = Individual, null = both. */
  isDeveloper?: boolean | null;
  /** Approved Company (master data) the owner is linked to. */
  companyId?: string | null;
  /** owners.assigned_agent_id. */
  agentId?: string | null;
  /** Archive state. Defaults to active owners only. */
  status?: "active" | "archived" | "all";
};

/** How many owners a search returns at most (the rest are found by typing more). */
const OWNER_SEARCH_LIMIT = 100;

/**
 * Owners list. With a search term the matching happens in the database (search_owner_ids): it
 * covers name, company, code, email and phone number, but a phone number only counts for owners
 * whose phone the signed-in user is allowed to see. The browser never receives phones to filter
 * on, and typing a hidden owner's number finds nothing.
 */
export function useOwners(searchOrFilters: string | OwnerFilters = "") {
  const filters: OwnerFilters =
    typeof searchOrFilters === "string" ? { search: searchOrFilters } : searchOrFilters;
  const term = (filters.search ?? "").trim();
  const { isDeveloper = null, companyId = null, agentId = null, status = "active" } = filters;
  return useQuery({
    queryKey: ownerKeys.list({ search: term, isDeveloper, companyId, agentId, status }),
    queryFn: async (): Promise<SafeOwner[]> => {
      let q = sb.from("owners").select(OWNER_COLUMNS).order("name", { ascending: true });
      if (status !== "all") q = q.eq("status", status);
      if (isDeveloper !== null) q = q.eq("is_developer", isDeveloper);
      if (companyId) q = q.eq("company_id", companyId);
      if (agentId) q = q.eq("assigned_agent_id", agentId);
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

/**
 * Owner names for pickers and filters. Selects only id, name and company: never phone or ID number,
 * so it is safe to use anywhere a list of owners is offered as choices.
 */
export function useOwnerOptions() {
  return useQuery({
    queryKey: ownerKeys.options,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("owners")
        .select("id, name, company")
        .eq("status", "active")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
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
        .select("id, title, reference_code, property_number_label, status, price, currency")
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
        .select("*, properties(title, reference_code, property_number_label)")
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

/**
 * Permanently deletes one owner through the same safe database function the bulk Delete uses. An owner that
 * still has properties, developments, contracts, conversations or other linked records is refused (archive it
 * instead), so a property is never silently detached from its owner.
 */
export function useDeleteOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.rpc("bulk_delete_owners", { _ids: [id] });
      if (error) throw error;
      const result = data as unknown as { deleted: number; blocked: { name: string; linked: Record<string, number> }[] };
      if (result.deleted === 0) {
        const blocked = result.blocked?.[0];
        throw new Error(
          blocked
            ? `${blocked.name} cannot be deleted because it still has linked records (${Object.entries(blocked.linked)
                .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
                .join(", ")}). Archive the owner instead.`
            : "This owner could not be deleted.",
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ownerKeys.all }),
  });
}
