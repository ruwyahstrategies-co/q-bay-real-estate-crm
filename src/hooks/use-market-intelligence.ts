import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type MarketingIdea = {
  topic: string;
  targetBuyer: string;
  buyerProblem: string;
  format: string;
  supportingPattern: string;
  relatedPropertyRefs: string[];
  evidenceReferences: string[];
};

export type MarketReportOutput = {
  label: "early_signals" | "pattern_analysis";
  summary: string;
  commonBuyerNeeds: { need: string; supportCount: number; evidenceReferences: string[] }[];
  commonObjections: { objection: string; supportCount: number; evidenceReferences: string[] }[];
  requestedFeatures: string[];
  growingInterest: { topic: string; evidenceReferences: string[] }[];
  lostInterestReasons: { reason: string; evidenceReferences: string[] }[];
  languagePatterns: string[];
  trustBuilders: string[];
  hesitationTriggers: string[];
  marketingGaps: { gap: string; evidenceReferences: string[] }[];
  positioningImprovements: { finding: string; evidence: string; recommendation: string; confidence: "low"|"medium"|"high"; evidenceReferences: string[] }[];
  marketingIdeas: MarketingIdea[];
  brandFixes: { issue: string; supportCount: number; whyItMatters: string; correction: string; confidence: "low"|"medium"|"high"; evidenceReferences: string[] }[];
  campaignOpportunities: { opportunity: string; internalDemandRef: string[]; externalSourceRefs: string[]; recommendation: string; confidence: "low"|"medium"|"high" }[];
};

export type MarketReport = {
  id: string;
  status: "processing" | "completed" | "failed";
  label: "early_signals" | "pattern_analysis";
  conversation_count: number;
  lead_count: number;
  model: string | null;
  input_snapshot: any;
  output_json: MarketReportOutput | null;
  source_ids: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export const marketReportKeys = {
  all: ["market_intelligence_reports"] as const,
};

export function useMarketReports() {
  return useQuery({
    queryKey: marketReportKeys.all,
    queryFn: async () => {
      const { data, error } = await (sb as any)
        .from("market_intelligence_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as MarketReport[];
    },
  });
}

export function useGenerateMarketIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.functions.invoke("market-intelligence", { body: {} });
      if (error) {
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
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketReportKeys.all }),
  });
}
