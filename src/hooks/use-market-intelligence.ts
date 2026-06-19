import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type FocusInput = {
  objective: string;
  custom_objective?: string;
  focus?: { location?: string; property_type?: string; buyer_segment?: string; property_id?: string; campaign?: string; topic?: string };
  period?: { kind: "week"|"month"|"90d"|"custom"; start?: string; end?: string };
  mode?: "strategy"|"brand_gap";
};

export type StrategyOutput = {
  mode: "strategy";
  objective: string;
  custom_objective?: string;
  focus?: any;
  period?: any;
  period_focus: { objective: string; topic: string; period_label: string };
  buyer_language: { finding: string; evidence_tags: string[]; refs: string[] }[];
  brand_gaps: { gap: string; evidence_tags: string[]; refs: string[] }[];
  recommended_direction: string;
  campaign_ideas: {
    angle: string; audience: string; problem: string;
    channel: string; channel_reason: string;
    related_property_refs: string[]; evidence_tags: string[]; refs: string[];
  }[];
  actions_this_week: { action: string; why: string; evidence_tags: string[]; refs: string[] }[];
  label: "early_signals"|"pattern_analysis";
};

export type BrandGapOutput = {
  mode: "brand_gap";
  objective: string;
  current_online_positioning: string;
  buyer_perception: string;
  positioning_gap: string;
  recommended_positioning: string;
  messaging_changes: {
    website_headline: string; campaign_angle: string; social_direction: string;
    sales_talking_point: string; trust_signal_to_add: string; missing_information: string;
  };
  distribution_recommendation: { channel: string; reason: string; evidence_tags: string[]; refs: string[] }[];
  evidence: { claim: string; refs: string[]; evidence_tags: string[] }[];
};

export type MarketReport = {
  id: string;
  status: "processing"|"completed"|"failed";
  label: "early_signals"|"pattern_analysis";
  conversation_count: number;
  lead_count: number;
  model: string | null;
  input_snapshot: any;
  output_json: (StrategyOutput | BrandGapOutput) | null;
  source_ids: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export const marketReportKeys = { all: ["market_intelligence_reports"] as const };

export function useMarketReports() {
  return useQuery({
    queryKey: marketReportKeys.all,
    queryFn: async () => {
      const { data, error } = await (sb as any).from("market_intelligence_reports").select("*").order("created_at",{ascending:false}).limit(40);
      if (error) throw error;
      return (data ?? []) as MarketReport[];
    },
  });
}

export function useGenerateMarketIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FocusInput) => {
      const { data, error } = await sb.functions.invoke("market-intelligence", { body: input });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try {
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as { id: string; status: string; output?: StrategyOutput | BrandGapOutput };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketReportKeys.all }),
  });
}
