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

export type PropertyLeadRow = {
  lead_id: string;
  full_name: string;
  classification: string | null;
  pipeline_stage: string;
  status: string;
  assigned_agent_name: string | null;
  interest_level: string | null;
  interest_status: string | null;
  base_intent_score: number | null;
  intended_transaction_date: string | null;
  transaction_timeframe: string | null;
  latest_interaction_at: string | null;
  latest_interaction_type: string | null;
  has_viewing: boolean;
  latest_viewing_status: string | null;
  has_offer: boolean;
  latest_offer_status: string | null;
};

/**
 * Every Lead connected to a Property, unioned across the relationships that
 * already exist (Lead Property Interests, Viewings, Offers) rather than
 * duplicating leads into a property-owned list. One row per lead.
 */
export function usePropertyLeads(propertyId: string | undefined) {
  return useQuery({
    enabled: !!propertyId,
    queryKey: ["refs", "property-leads", propertyId],
    queryFn: async (): Promise<PropertyLeadRow[]> => {
      const [{ data: interests = [] }, { data: viewings = [] }, { data: offers = [] }] = await Promise.all([
        sb.from("lead_property_interests").select("lead_id, interest_level, status").eq("property_id", propertyId!),
        sb.from("viewings").select("lead_id, status, scheduled_at").eq("property_id", propertyId!).order("scheduled_at", { ascending: false }),
        sb.from("offers").select("lead_id, status, created_at").eq("property_id", propertyId!).order("created_at", { ascending: false }),
      ]);

      const leadIds = new Set<string>();
      for (const i of interests as any[]) if (i.lead_id) leadIds.add(i.lead_id);
      for (const v of viewings as any[]) if (v.lead_id) leadIds.add(v.lead_id);
      for (const o of offers as any[]) if (o.lead_id) leadIds.add(o.lead_id);
      if (leadIds.size === 0) return [];

      const ids = Array.from(leadIds);
      const [{ data: leads = [] }, { data: analyses = [] }, { data: recentInteractions = [] }] = await Promise.all([
        sb.from("leads").select("id, full_name, classification, pipeline_stage, status, assigned_agent_id, intent_score, intended_transaction_date, transaction_timeframe, team_members(full_name)").in("id", ids),
        (sb as any).from("ai_analyses").select("lead_id, status, output_json, completed_at").in("lead_id", ids).eq("status", "completed").order("completed_at", { ascending: false }),
        sb.from("interactions").select("lead_id, interaction_type, interaction_date").in("lead_id", ids).order("interaction_date", { ascending: false }),
      ]);

      const interestByLead = new Map((interests as any[]).map((i) => [i.lead_id, i]));
      const latestAnalysisByLead = new Map<string, any>();
      for (const a of analyses as any[]) if (!latestAnalysisByLead.has(a.lead_id)) latestAnalysisByLead.set(a.lead_id, a);
      const latestInteractionByLead = new Map<string, any>();
      for (const i of recentInteractions as any[]) if (!latestInteractionByLead.has(i.lead_id)) latestInteractionByLead.set(i.lead_id, i);
      const viewingsByLead = new Map<string, any[]>();
      for (const v of viewings as any[]) {
        if (!v.lead_id) continue;
        const arr = viewingsByLead.get(v.lead_id) ?? [];
        arr.push(v);
        viewingsByLead.set(v.lead_id, arr);
      }
      const offersByLead = new Map<string, any[]>();
      for (const o of offers as any[]) {
        if (!o.lead_id) continue;
        const arr = offersByLead.get(o.lead_id) ?? [];
        arr.push(o);
        offersByLead.set(o.lead_id, arr);
      }

      return (leads as any[]).map((l): PropertyLeadRow => {
        const interest = interestByLead.get(l.id);
        const analysis = latestAnalysisByLead.get(l.id);
        const interaction = latestInteractionByLead.get(l.id);
        const leadViewings = viewingsByLead.get(l.id) ?? [];
        const leadOffers = offersByLead.get(l.id) ?? [];
        return {
          lead_id: l.id,
          full_name: l.full_name,
          classification: l.classification,
          pipeline_stage: l.pipeline_stage,
          status: l.status,
          assigned_agent_name: l.team_members?.full_name ?? null,
          interest_level: interest?.interest_level ?? null,
          interest_status: interest?.status ?? null,
          base_intent_score: analysis?.output_json?.deep_analysis?.intent_score ?? analysis?.output_json?.intentScore ?? l.intent_score ?? null,
          intended_transaction_date: l.intended_transaction_date,
          transaction_timeframe: l.transaction_timeframe,
          latest_interaction_at: interaction?.interaction_date ?? null,
          latest_interaction_type: interaction?.interaction_type ?? null,
          has_viewing: leadViewings.length > 0,
          latest_viewing_status: leadViewings[0]?.status ?? null,
          has_offer: leadOffers.length > 0,
          latest_offer_status: leadOffers[0]?.status ?? null,
        };
      });
    },
  });
}
