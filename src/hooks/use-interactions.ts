import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Interaction, type InteractionInsert } from "@/lib/db";

export const interactionKeys = {
  all: ["interactions"] as const,
  list: (filters?: Record<string, unknown>) => ["interactions", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["interactions", "lead", leadId] as const,
};

export function useInteractions(opts?: { leadId?: string; ownerId?: string; search?: string; type?: string | null }) {
  const { leadId, ownerId, search = "", type = null } = opts ?? {};
  return useQuery({
    queryKey: interactionKeys.list({ leadId, ownerId, search, type }),
    queryFn: async (): Promise<Interaction[]> => {
      let q = sb
        .from("interactions")
        .select("*, leads(full_name), properties(title)")
        .order("interaction_date", { ascending: false });
      if (leadId) q = q.eq("lead_id", leadId);
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (type) q = q.eq("interaction_type", type);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`subject.ilike.${term},content.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Interaction[];
    },
  });
}

export function useCreateInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InteractionInsert) => {
      const { data, error } = await sb.from("interactions").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: interactionKeys.all }),
  });
}

export function useUpdateInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Interaction> }) => {
      const { data, error } = await sb.from("interactions").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: interactionKeys.all }),
  });
}

export function useDeleteInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("interactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: interactionKeys.all }),
  });
}
