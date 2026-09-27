import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import { envWebsiteUrl } from "@/lib/property-share";
import { normalizeWebsiteUrl } from "@/lib/website-link";

const KEY = "public_website_url";

/**
 * The address of the public Q-Bay website, entered once by an administrator in Settings and read
 * from app_settings (staff-read, admin-write). VITE_PUBLIC_WEBSITE_URL stays as a fallback for
 * deployments that prefer to set it in the environment.
 */
export function usePublicWebsiteConfig() {
  return useQuery({
    queryKey: ["app_settings", KEY],
    queryFn: async (): Promise<{ url: string | null }> => {
      const { data, error } = await sb
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", KEY)
        .maybeSingle();
      if (error) throw error;
      const url = (data?.setting_value as { url?: string } | undefined)?.url ?? null;
      return { url };
    },
    staleTime: 5 * 60_000,
  });
}

export function useSavePublicWebsiteUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string): Promise<string> => {
      const url = normalizeWebsiteUrl(input);
      if (!url) {
        throw new Error("Enter the website address as https://your-domain (no path).");
      }
      const { data: existing } = await sb
        .from("app_settings")
        .select("id")
        .eq("setting_key", KEY)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await sb
          .from("app_settings")
          .update({ setting_value: { url }, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("app_settings")
          .insert({ setting_key: KEY, setting_value: { url } });
        if (error) throw error;
      }
      return url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings", KEY] }),
  });
}

/** The website address property links are built from: Settings first, environment second. */
export function usePublicWebsiteUrl(): {
  url: string | null;
  isLoading: boolean;
  source: "settings" | "env" | null;
} {
  const { data, isLoading } = usePublicWebsiteConfig();
  const fromSettings = normalizeWebsiteUrl(data?.url);
  if (fromSettings) return { url: fromSettings, isLoading, source: "settings" };
  const fromEnv = normalizeWebsiteUrl(envWebsiteUrl());
  return { url: fromEnv, isLoading, source: fromEnv ? "env" : null };
}
