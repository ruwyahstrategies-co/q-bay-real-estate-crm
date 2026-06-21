import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type TranscribeResponse = {
  ok?: boolean;
  interaction_id?: string;
  transcript_length?: number;
  extraction?: {
    summary: string;
    requirements: string[];
    objections: string[];
    property_mentions: { id: string | null; label: string }[];
    next_actions: string[];
    buyer_sentiment: string;
  } | null;
  error?: string;
};

export function useTranscribeCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { upload_id: string; lead_id?: string; direction?: "inbound" | "outbound" }) => {
      const { data, error } = await sb.functions.invoke("transcribe-call", { body: input });
      if (error) {
        let msg = error.message;
        try {
          const ctx: any = (error as any).context;
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as TranscribeResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interactions"] });
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["ai_analyses"] });
      qc.invalidateQueries({ queryKey: ["property_events"] });
    },
  });
}
