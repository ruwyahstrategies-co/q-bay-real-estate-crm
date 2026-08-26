import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Viewing, type ViewingInsert, type ViewingUpdate } from "@/lib/db";

export const viewingKeys = {
  all: ["viewings"] as const,
  list: (filters?: Record<string, unknown>) => ["viewings", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["viewings", "lead", leadId] as const,
};

export function useViewings(opts?: { agentId?: string; status?: string; from?: string; to?: string }) {
  const { agentId, status, from, to } = opts ?? {};
  return useQuery({
    queryKey: viewingKeys.list(opts as Record<string, unknown>),
    queryFn: async (): Promise<(Viewing & { leads: { full_name: string } | null; properties: { title: string } | null })[]> => {
      let q = sb
        .from("viewings")
        .select("*, leads(full_name), properties(title)")
        .order("scheduled_at", { ascending: true });
      if (agentId) q = q.eq("assigned_agent_id", agentId);
      if (status) q = q.eq("status", status);
      if (from) q = q.gte("scheduled_at", from);
      if (to) q = q.lte("scheduled_at", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useLeadViewings(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? viewingKeys.byLead(leadId) : ["viewings", "lead", "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<Viewing[]> => {
      const { data, error } = await sb.from("viewings").select("*").eq("lead_id", leadId!).order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ViewingInsert) => {
      const { data, error } = await sb.from("viewings").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.all }),
  });
}

export function useUpdateViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ViewingUpdate }) => {
      const { data, error } = await sb.from("viewings").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.all }),
  });
}

export function useCompleteViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data, error } = await sb
        .from("viewings")
        .update({ status: "completed", completed_at: new Date().toISOString(), ...(notes ? { notes } : {}) })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.all }),
  });
}

export function useDeleteViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("viewings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.all }),
  });
}
