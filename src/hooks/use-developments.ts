import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Development, type DevelopmentInsert, type DevelopmentUpdate } from "@/lib/db";

export const developmentKeys = {
  all: ["developments"] as const,
  list: (search?: string) => ["developments", "list", search ?? ""] as const,
  detail: (id: string) => ["developments", "detail", id] as const,
};

export function useDevelopments(opts?: { search?: string; publishedOnly?: boolean }) {
  const { search = "", publishedOnly = false } = opts ?? {};
  return useQuery({
    queryKey: developmentKeys.list(search + (publishedOnly ? ":published" : "")),
    queryFn: async (): Promise<Development[]> => {
      let q = sb.from("developments").select("*").order("created_at", { ascending: false });
      if (publishedOnly) q = q.eq("is_published", true);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
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
