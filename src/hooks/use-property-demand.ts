import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type DemandRow = {
  property_id: string;
  views: number;
  mentions: number;
  enquiries: number;
  shortlists: number;
  viewing_requests: number;
  offers: number;
  rejections: number;
  closed_deals: number;
  brochure_downloads: number;
  unique_event_leads: number;
  interested_leads: number;
  last_event_at: string | null;
  demand_score: number;
};

export function usePropertyDemandScores() {
  return useQuery({
    queryKey: ["property_demand_scores"],
    queryFn: async () => {
      const { data, error } = await (sb as any)
        .from("property_demand_scores")
        .select("*");
      if (error) throw error;
      return (data ?? []) as DemandRow[];
    },
    staleTime: 30_000,
  });
}

// Return supporting leads (via lead_property_interests + property_events with lead_id) and
// supporting interactions (via interactions table) for a given property.
export function usePropertySupport(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["property_support", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const [{ data: interests = [] }, { data: events = [] }, { data: interactions = [] }] = await Promise.all([
        sb.from("lead_property_interests")
          .select("id, interest_level, notes, leads(id, full_name, pipeline_stage)")
          .eq("property_id", propertyId!),
        sb.from("property_events")
          .select("id, event_type, occurred_at, lead_id, leads(id, full_name), source, source_ref")
          .eq("property_id", propertyId!)
          .not("lead_id", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(20),
        sb.from("interactions")
          .select("id, interaction_type, subject, content, interaction_date, lead_id, leads(id, full_name)")
          .eq("property_id", propertyId!)
          .order("interaction_date", { ascending: false })
          .limit(20),
      ]);
      return {
        interests: interests as any[],
        events: events as any[],
        interactions: interactions as any[],
      };
    },
  });
}
