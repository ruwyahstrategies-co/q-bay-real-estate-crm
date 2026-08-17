import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type LeadRef = { id: string; full_name: string };
export type PropertyRef = { id: string; title: string; reference_code: string | null };
export type InteractionRef = { id: string; interaction_type: string; interaction_date: string; subject: string | null; lead_id: string | null; lead_name?: string };

// Properties tied to a lead: from lead_property_interests + property_events.source=interaction joining via lead's interactions
export function useLeadReferences(leadId: string | undefined) {
  return useQuery({
    enabled: !!leadId,
    queryKey: ["refs", "lead", leadId],
    queryFn: async () => {
      const [{ data: interests = [] }, { data: interactions = [] }] = await Promise.all([
        sb.from("lead_property_interests").select("id, interest_level, status, notes, property_id, properties(id, title, reference_code, location, property_type, price, currency)").eq("lead_id", leadId!),
        sb.from("interactions").select("id").eq("lead_id", leadId!),
      ]);
      const intIds = (interactions as any[]).map((i) => i.id);
      let mentioned: any[] = [];
      if (intIds.length) {
        const { data: events = [] } = await (sb as any).from("property_events")
          .select("property_id, source_id, occurred_at, event_type, properties(id, title, reference_code)")
          .eq("event_type", "mention").in("source_id", intIds);
        mentioned = events as any[];
      }
      return { interests, mentioned };
    },
  });
}

/** Property ids a lead is currently linked to via lead_property_interests. */
export function useLeadPropertyInterests(leadId: string | undefined) {
  return useQuery({
    enabled: !!leadId,
    queryKey: ["lead_property_interest_ids", leadId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.from("lead_property_interests").select("property_id").eq("lead_id", leadId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.property_id);
    },
  });
}

/** Diffs the desired property_id set against lead_property_interests and inserts/deletes accordingly. */
export function useSyncLeadPropertyInterests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, propertyIds }: { leadId: string; propertyIds: string[] }) => {
      const { data: existing, error: readErr } = await sb
        .from("lead_property_interests")
        .select("id, property_id")
        .eq("lead_id", leadId);
      if (readErr) throw readErr;
      const existingIds = new Set((existing ?? []).map((r) => r.property_id));
      const desired = new Set(propertyIds);

      const toInsert = propertyIds.filter((id) => !existingIds.has(id));
      const toDelete = (existing ?? []).filter((r) => !desired.has(r.property_id)).map((r) => r.id);

      if (toInsert.length) {
        const { error } = await sb.from("lead_property_interests").insert(toInsert.map((property_id) => ({ lead_id: leadId, property_id })));
        if (error) throw error;
      }
      if (toDelete.length) {
        const { error } = await sb.from("lead_property_interests").delete().in("id", toDelete);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lead_property_interest_ids", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["refs", "lead", vars.leadId] });
    },
  });
}

// For a property: leads interested + interactions where the property was mentioned
export function usePropertyReferences(propertyId: string | undefined) {
  return useQuery({
    enabled: !!propertyId,
    queryKey: ["refs", "property", propertyId],
    queryFn: async () => {
      const [{ data: interests = [] }, { data: events = [] }] = await Promise.all([
        sb.from("lead_property_interests").select("id, interest_level, status, lead_id, leads(id, full_name)").eq("property_id", propertyId!),
        (sb as any).from("property_events").select("source_id, occurred_at, event_type, source").eq("property_id", propertyId!).eq("event_type", "mention").order("occurred_at",{ascending:false}).limit(50),
      ]);
      const interactionIds = Array.from(new Set((events as any[]).map((e) => e.source_id).filter(Boolean)));
      let interactions: any[] = [];
      if (interactionIds.length) {
        const { data: ints = [] } = await sb.from("interactions").select("id, interaction_type, interaction_date, subject, lead_id, leads(id, full_name)").in("id", interactionIds);
        interactions = ints as any[];
      }
      return { interests, interactions };
    },
  });
}
