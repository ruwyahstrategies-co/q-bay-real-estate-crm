import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import type { Database } from "@/integrations/supabase/types";

export type AIAnalysis = Database["public"]["Tables"]["ai_analyses"]["Row"];

export type SalesIntelligenceOutput = {
  buyer_summary: {
    buyer_type: string;
    budget: string;
    preferred_locations: string[];
    property_type: string;
    timeline: string;
    financing: string;
    pipeline_stage: string;
    main_motivation: string;
  };
  wants: {
    explicit_requirements: string[];
    must_haves: string[];
    preferences: string[];
    mentioned_properties: { property_id: string | null; label: string; status: "viewed"|"mentioned"|"shortlisted"|"rejected" }[];
    rejected: string[];
    missing_info: string[];
  };
  sales_playbook: {
    next_action: string;
    call_strategy: string;
    questions: string[];
    whatsapp_draft: string;
    email_draft: string;
    objection_response: string;
  };
  pain_points: { concern: string; evidence: string[]; how_to_address: string; what_to_avoid: string }[];
  property_matches: { property_id: string; match_percent: number; reasons: string[]; conflicts: string[]; price: string; availability: string }[];
  deep_analysis: {
    motivations: { label: string; explanation: string; evidence: string[] }[];
    risks: { label: string; explanation: string; evidence: string[] }[];
    urgency: string;
    confidence: number;
    intent_score: number;
    buyer_status: "cold"|"warm"|"hot"|"at_risk"|"unclear";
    summary: string;
  };
};

export function isSalesIntelligence(o: any): o is SalesIntelligenceOutput {
  return !!o && typeof o === "object" && !!o.buyer_summary && !!o.sales_playbook && Array.isArray(o.pain_points);
}

export function useLeadAnalyses(leadId: string | undefined) {
  return useQuery({
    queryKey: ["ai_analyses", leadId],
    enabled: !!leadId,
    // Analyses only change when someone re-runs them (which invalidates this
    // key), so keep results cached instead of refetching on every tab switch.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_analyses")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as AIAnalysis[];
    },
  });
}

export function useAllCompletedAnalyses() {
  return useQuery({
    queryKey: ["ai_analyses", "all_completed"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_analyses")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as AIAnalysis[];
    },
  });
}

export function useAnalyseLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await sb.functions.invoke("analyze-lead", { body: { lead_id: leadId } });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try {
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as { id: string; status: string; output?: SalesIntelligenceOutput; error?: string };
    },
    onSuccess: (_d, leadId) => {
      qc.invalidateQueries({ queryKey: ["ai_analyses", leadId] });
      qc.invalidateQueries({ queryKey: ["ai_analyses", "all_completed"] });
    },
  });
}
