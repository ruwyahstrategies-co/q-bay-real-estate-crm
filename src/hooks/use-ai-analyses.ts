import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import type { Database } from "@/integrations/supabase/types";

export type AIAnalysis = Database["public"]["Tables"]["ai_analyses"]["Row"];

export type BuyerAnalysisOutput = {
  summary: string;
  intentScore: number;
  confidenceScore: number;
  recommendedPipelineStage: string;
  buyerStatus: "cold" | "warm" | "hot" | "at_risk" | "unclear";
  motivations: { label: string; explanation: string; confidence: number; evidenceReferences: string[] }[];
  objections: { label: string; severity: "low"|"medium"|"high"; explanation: string; recommendedResponse: string; evidenceReferences: string[] }[];
  urgency: { level: "low"|"medium"|"high"|"unknown"; explanation: string; evidenceReferences: string[] };
  budgetSignals: { strength: "weak"|"moderate"|"strong"|"unknown"; explanation: string; evidenceReferences: string[] };
  decisionFactors: { factor: string; importance: "low"|"medium"|"high"; evidenceReferences: string[] }[];
  risks: { risk: string; severity: "low"|"medium"|"high"; explanation: string; recommendedAction: string; evidenceReferences: string[] }[];
  propertyMatchingCriteria: {
    locations: string[]; propertyTypes: string[]; bedrooms: number[];
    budgetMinimum: number | null; budgetMaximum: number | null; currency: string | null;
    completionStatus: string[]; mustHaveFeatures: string[]; preferredFeatures: string[]; avoidFeatures: string[];
  };
  nextBestActions: { priority: number; action: string; reason: string; recommendedTiming: string; relatedLeadId: string | null; relatedPropertyId: string | null }[];
  followUpDraft: { channel: "whatsapp"|"email"|"phone"|"meeting"; message: string; objective: string; tone: string };
  missingInformation: { field: string; reason: string; suggestedQuestion: string }[];
  evidenceSummary: { claim: string; sourceReferences: string[] }[];
};

export function useLeadAnalyses(leadId: string | undefined) {
  return useQuery({
    queryKey: ["ai_analyses", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_analyses")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AIAnalysis[];
    },
  });
}

export function useAllCompletedAnalyses() {
  return useQuery({
    queryKey: ["ai_analyses", "all_completed"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_analyses")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AIAnalysis[];
    },
  });
}

export function useAnalyseLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await sb.functions.invoke("analyze-lead", {
        body: { lead_id: leadId },
      });
      if (error) {
        // Try to surface server-provided message
        const ctx: any = (error as any).context;
        let msg = error.message;
        try {
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) {
            const parsed = JSON.parse(txt);
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as { id: string; status: string; output?: BuyerAnalysisOutput; error?: string };
    },
    onSuccess: (_d, leadId) => {
      qc.invalidateQueries({ queryKey: ["ai_analyses", leadId] });
      qc.invalidateQueries({ queryKey: ["ai_analyses", "all_completed"] });
    },
  });
}
