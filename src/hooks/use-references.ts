import { useQuery } from "@tanstack/react-query";
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
