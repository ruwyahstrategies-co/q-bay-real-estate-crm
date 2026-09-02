import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

const notificationKeys = {
  scheduled: ["scheduled_notifications"] as const,
  providerConfig: ["sms_provider_config"] as const,
};

export type SmsProviderConfig = { provider: string | null; sender_id: string | null; api_key_secret_id: string | null };

export function useScheduledNotifications(status?: "pending" | "sent" | "failed" | "skipped") {
  return useQuery({
    queryKey: [...notificationKeys.scheduled, status ?? "all"],
    queryFn: async () => {
      let q = sb.from("scheduled_notifications").select("*, owners(name)").order("scheduled_for", { ascending: false }).limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSmsProviderConfig() {
  return useQuery({
    queryKey: notificationKeys.providerConfig,
    queryFn: async (): Promise<SmsProviderConfig> => {
      const { data } = await sb.from("app_settings").select("setting_value").eq("setting_key", "sms_provider_config").maybeSingle();
      const v = data?.setting_value as SmsProviderConfig | null;
      return v ?? { provider: null, sender_id: null, api_key_secret_id: null };
    },
  });
}

export function useSaveSmsProviderConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: SmsProviderConfig) => {
      const { error } = await sb.from("app_settings").upsert({ setting_key: "sms_provider_config", setting_value: config }, { onConflict: "setting_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.providerConfig }),
  });
}

export function useProcessDueNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.functions.invoke("sms-send", { body: {} });
      if (error) throw error;
      return data as { ok: boolean; processed: number; sent: number; failed: number; skipped: number; provider_configured: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.scheduled }),
  });
}
