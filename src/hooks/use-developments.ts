import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Development, type DevelopmentInsert, type DevelopmentUpdate } from "@/lib/db";

export const developmentKeys = {
  all: ["developments"] as const,
  list: (filters?: Record<string, unknown>) => ["developments", "list", filters ?? {}] as const,
  detail: (id: string) => ["developments", "detail", id] as const,
};

export {
  DEVELOPMENT_STATUS_OPTIONS,
  LEGACY_DEVELOPMENT_STATUS,
  developmentStatusChoices,
  developmentStatusLabel,
} from "@/lib/development-status";

export type DevelopmentFilters = {
  /** Matches the development name or its developer name. */
  search?: string;
  publishedOnly?: boolean;
  /** Approved Developer (master data) the development is linked to. */
  developerId?: string | null;
  /** Owner the development belongs to. */
  ownerId?: string | null;
  status?: string | null;
  countryId?: string | null;
  areaId?: string | null;
  placeId?: string | null;
  /** Assigned agent (team member id). */
  agentId?: string | null;
  published?: "published" | "draft" | null;
};

/** Removes characters that would break a PostgREST or() expression from free-typed search text. */
function safeSearchTerm(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Developments list. Every filter is a database condition on the matching column, so they combine
 * freely with each other and with search, and the full filter set is part of the query key.
 */
export function useDevelopments(opts?: DevelopmentFilters) {
  const {
    search = "",
    publishedOnly = false,
    developerId = null,
    ownerId = null,
    status = null,
    countryId = null,
    areaId = null,
    placeId = null,
    agentId = null,
    published = null,
  } = opts ?? {};
  return useQuery({
    queryKey: developmentKeys.list({
      search: search.trim(),
      publishedOnly,
      developerId,
      ownerId,
      status,
      countryId,
      areaId,
      placeId,
      agentId,
      published,
    }),
    queryFn: async (): Promise<Development[]> => {
      let q = sb.from("developments").select("*").order("created_at", { ascending: false });
      if (publishedOnly) q = q.eq("is_published", true);
      if (published === "published") q = q.eq("is_published", true);
      if (published === "draft") q = q.eq("is_published", false);
      if (developerId) q = q.eq("developer_id", developerId);
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (status) q = q.eq("status", status);
      if (agentId) q = q.eq("assigned_agent_id", agentId);
      if (placeId) q = q.eq("place_id", placeId);
      if (areaId) {
        q = q.eq("area_id", areaId);
      } else if (countryId) {
        // Older records can carry an area but no country; they belong to the country of that area.
        const { data: areas, error: areaError } = await sb.from("areas").select("id").eq("country_id", countryId);
        if (areaError) throw areaError;
        const areaIds = (areas ?? []).map((a) => a.id);
        q = areaIds.length
          ? q.or(`country_id.eq.${countryId},area_id.in.(${areaIds.join(",")})`)
          : q.eq("country_id", countryId);
      }
      const term = safeSearchTerm(search);
      if (term) q = q.or(`name.ilike.%${term}%,developer.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDevelopment(id: string | undefined) {
  return useQuery({
    queryKey: id ? developmentKeys.detail(id) : ["developments", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("developments").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useDevelopmentProperties(developmentId: string | undefined) {
  return useQuery({
    queryKey: ["developments", "properties", developmentId ?? "none"],
    enabled: !!developmentId,
    queryFn: async () => {
      const { data, error } = await sb.from("properties").select("*").eq("development_id", developmentId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DevelopmentInsert) => {
      const { data, error } = await sb.from("developments").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: developmentKeys.all }),
  });
}

export function useUpdateDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DevelopmentUpdate }) => {
      const { data, error } = await sb.from("developments").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: developmentKeys.all });
      qc.invalidateQueries({ queryKey: developmentKeys.detail(vars.id) });
    },
  });
}

export function useDeleteDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("developments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: developmentKeys.all }),
  });
}
