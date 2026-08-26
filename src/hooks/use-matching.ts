import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type MatchRow = { property_id: string; score: number; reasons: string[] };
export type ProspectRow = { lead_id: string; score: number; reasons: string[] };

/** Deterministic lead -> recommended properties, computed entirely in Postgres. */
export function usePropertyMatchesForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ["matching", "lead", leadId ?? "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<MatchRow[]> => {
      const { data, error } = await sb.rpc("match_properties_for_lead", { _lead_id: leadId!, _limit: 8 });
      if (error) throw error;
      return (data ?? []) as MatchRow[];
    },
  });
}

/** Deterministic property -> matching historical prospects. */
export function useProspectsForProperty(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["matching", "property", propertyId ?? "none"],
    enabled: !!propertyId,
    queryFn: async (): Promise<ProspectRow[]> => {
      const { data, error } = await sb.rpc("match_prospects_for_property", { _property_id: propertyId!, _limit: 8 });
      if (error) throw error;
      return (data ?? []) as ProspectRow[];
    },
  });
}

/** Similar properties (used on property detail; same RPC will power the future public website). */
export function useSimilarProperties(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["matching", "similar", propertyId ?? "none"],
    enabled: !!propertyId,
    queryFn: async (): Promise<MatchRow[]> => {
      const { data, error } = await sb.rpc("similar_properties", { _property_id: propertyId!, _limit: 6 });
      if (error) throw error;
      return (data ?? []) as MatchRow[];
    },
  });
}
