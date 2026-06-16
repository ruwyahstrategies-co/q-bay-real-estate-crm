import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Property, type PropertyInsert, type PropertyUpdate } from "@/lib/db";

export const propertyKeys = {
  all: ["properties"] as const,
  list: (filters?: Record<string, unknown>) => ["properties", "list", filters ?? {}] as const,
  detail: (id: string) => ["properties", "detail", id] as const,
  media: (id: string) => ["properties", "media", id] as const,
};

export function useProperties(opts?: { search?: string; type?: string | null; status?: "active" | "archived" | "all" }) {
  const { search = "", type = null, status = "active" } = opts ?? {};
  return useQuery({
    queryKey: propertyKeys.list({ search, type, status }),
    queryFn: async (): Promise<Property[]> => {
      let q = sb.from("properties").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (type) q = q.eq("property_type", type);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},reference_code.ilike.${term},location.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: id ? propertyKeys.detail(id) : ["properties", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("properties").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePropertyMedia(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? propertyKeys.media(propertyId) : ["properties", "media", "none"],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_media")
        .select("*, uploads(*)")
        .eq("property_id", propertyId!)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PropertyInsert) => {
      const { data, error } = await sb.from("properties").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PropertyUpdate }) => {
      const { data, error } = await sb.from("properties").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: propertyKeys.detail(vars.id) });
    },
  });
}

export function useArchiveProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("properties")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}
