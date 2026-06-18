import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type ExternalMarketSource = {
  id: string;
  query: string | null;
  title: string;
  publisher: string | null;
  url: string;
  summary: string | null;
  retrieved_at: string;
  relevant_locations: string[];
  relevant_property_types: string[];
  price_info: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export const sourceKeys = {
  all: ["external_market_sources"] as const,
};

export function useMarketSources() {
  return useQuery({
    queryKey: sourceKeys.all,
    queryFn: async (): Promise<ExternalMarketSource[]> => {
      const { data, error } = await (sb as any)
        .from("external_market_sources")
        .select("*")
        .order("retrieved_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ExternalMarketSource[];
    },
  });
}

export function useRefreshMarketData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { query?: string; url?: string; locations?: string[]; property_types?: string[] }) => {
      const { data, error } = await sb.functions.invoke("web-search", { body: input });
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
      return data as { ok: boolean; inserted: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sourceKeys.all }),
  });
}

export function useSetSourceActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (sb as any)
        .from("external_market_sources")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sourceKeys.all }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (sb as any).from("external_market_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sourceKeys.all }),
  });
}
