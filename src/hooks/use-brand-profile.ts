import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type BrandProfile = {
  brand_name: string;
  website: string;
  social_handles: string[];
  location: string;
  services: string[];
  competitors: string[];
};

const KEY = "brand_profile";

export function useBrandProfile() {
  return useQuery({
    queryKey: ["app_settings", KEY],
    queryFn: async (): Promise<BrandProfile | null> => {
      const { data, error } = await sb.from("app_settings").select("setting_value").eq("setting_key", KEY).maybeSingle();
      if (error) throw error;
      return (data?.setting_value as BrandProfile | undefined) ?? null;
    },
  });
}

export function useSaveBrandProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: BrandProfile) => {
      const { data: existing } = await sb.from("app_settings").select("id").eq("setting_key", KEY).maybeSingle();
      if (existing?.id) {
        const { error } = await sb.from("app_settings").update({ setting_value: profile as any, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("app_settings").insert({ setting_key: KEY, setting_value: profile as any });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings", KEY] }),
  });
}

export function useBrandSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: BrandProfile) => {
      const { data, error } = await sb.functions.invoke("brand-search", { body: profile });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        try {
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as { ok: boolean; inserted: number; errors?: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external_market_sources"] }),
  });
}
