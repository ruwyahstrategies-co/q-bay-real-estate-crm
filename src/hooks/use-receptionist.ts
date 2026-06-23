import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ReceptionistCall = Database["public"]["Tables"]["receptionist_calls"]["Row"];
export type ReceptionistSettings = Database["public"]["Tables"]["receptionist_settings"]["Row"];
export type ReceptionistToolEvent = Database["public"]["Tables"]["receptionist_tool_events"]["Row"];

export type ReceptionistStatus = {
  mode: "live" | "partial" | "not_configured";
  elevenlabs: {
    api_key_present: boolean;
    agent_id_present: boolean;
    agent_id_masked: string | null;
    webhook_secret_present: boolean;
  };
  twilio: {
    account_sid_present: boolean;
    account_sid_masked: string | null;
    auth_token_present: boolean;
    phone_number_present: boolean;
    phone_number_masked: string | null;
  };
  transfer: { number_present: boolean; number_masked: string | null };
  last_webhook_at: string | null;
  inbound_ready: boolean;
  transfer_ready: boolean;
};

export function useReceptionistStatus() {
  return useQuery({
    queryKey: ["receptionist", "status"],
    queryFn: async (): Promise<ReceptionistStatus> => {
      const { data, error } = await supabase.functions.invoke("receptionist-status");
      if (error) throw error;
      return data as ReceptionistStatus;
    },
    staleTime: 15_000,
  });
}

export function useReceptionistSettings() {
  return useQuery({
    queryKey: ["receptionist", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receptionist_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateReceptionistSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ReceptionistSettings>) => {
      const { error } = await supabase
        .from("receptionist_settings")
        .update(patch)
        .eq("id", "default");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receptionist", "settings"] }),
  });
}

export function useReceptionistCalls() {
  return useQuery({
    queryKey: ["receptionist", "calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receptionist_calls")
        .select("*, leads(id, full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReceptionistCallToolEvents(callId: string | null) {
  return useQuery({
    queryKey: ["receptionist", "call", callId, "events"],
    queryFn: async () => {
      if (!callId) return [];
      const { data, error } = await supabase
        .from("receptionist_tool_events")
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!callId,
  });
}
