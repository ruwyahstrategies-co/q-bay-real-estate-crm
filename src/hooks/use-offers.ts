import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Offer = Tables<"offers">;
export type OfferInsert = TablesInsert<"offers">;
export type OfferUpdate = TablesUpdate<"offers">;

export const OFFER_STATUSES = ["draft", "submitted", "countered", "accepted", "rejected", "withdrawn", "expired"] as const;

export const offerKeys = {
  all: ["offers"] as const,
  list: (filters?: Record<string, unknown>) => ["offers", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["offers", "lead", leadId] as const,
};

export function useOffers(opts?: { agentId?: string; status?: string }) {
  const { agentId, status } = opts ?? {};
  return useQuery({
    queryKey: offerKeys.list(opts as Record<string, unknown>),
    queryFn: async (): Promise<(Offer & { leads: { full_name: string } | null; properties: { title: string } | null; developments: { name: string } | null })[]> => {
      let q = sb
        .from("offers")
        .select("*, leads(full_name), properties(title), developments(name)")
        .order("created_at", { ascending: false });
      if (agentId) q = q.eq("agent_id", agentId);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useLeadOffers(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? offerKeys.byLead(leadId) : ["offers", "lead", "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await sb.from("offers").select("*").eq("lead_id", leadId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OfferInsert) => {
      const { data, error } = await sb.from("offers").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: offerKeys.all }),
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OfferUpdate }) => {
      const { data, error } = await sb.from("offers").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: offerKeys.all }),
  });
}

export function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: offerKeys.all }),
  });
}
