import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

const KEY = "mapbox_config";

/**
 * One admin-entered Mapbox public token, shared by every CRM map and the
 * public website. Stored in app_settings (admin-write, staff-read); the
 * website reads it through the public_map_config() RPC so anon never gets a
 * raw grant on app_settings. VITE_MAPBOX_TOKEN stays a fallback for local dev
 * or before Q-Bay has entered one.
 */
export function useMapboxConfig() {
  return useQuery({
    queryKey: ["app_settings", KEY],
    queryFn: async (): Promise<{ token: string | null }> => {
      const { data, error } = await sb
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", KEY)
        .maybeSingle();
      if (error) throw error;
      const token = (data?.setting_value as { token?: string } | undefined)?.token ?? null;
      return { token };
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveMapboxConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data: existing } = await sb
        .from("app_settings")
        .select("id")
        .eq("setting_key", KEY)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await sb
          .from("app_settings")
          .update({ setting_value: { token }, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("app_settings")
          .insert({ setting_key: KEY, setting_value: { token } });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app_settings", KEY] }),
  });
}

/** Effective token for map components: centralised setting first, env fallback second. */
export function useMapboxToken(): { token: string | null; isLoading: boolean } {
  const { data, isLoading } = useMapboxConfig();
  const envToken =
    (import.meta.env as Record<string, string | undefined>)["VITE_MAPBOX_TOKEN"] ?? null;
  return { token: data?.token || envToken, isLoading };
}
