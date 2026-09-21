import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import { propertyKeys } from "./use-properties";

const keys = {
  cadence: ["availability_confirmation_cadence"] as const,
  history: (propertyId: string) => ["availability_confirmations", propertyId] as const,
};

export function useAvailabilityConfirmationCadence() {
  return useQuery({
    queryKey: keys.cadence,
    queryFn: async (): Promise<number> => {
      const { data } = await sb
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "availability_confirmation")
        .maybeSingle();
      const v = data?.setting_value as { cadence_days?: number } | null;
      return v?.cadence_days ?? 30;
    },
  });
}

export function useSaveAvailabilityConfirmationCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cadenceDays: number) => {
      const { error } = await sb
        .from("app_settings")
        .upsert(
          {
            setting_key: "availability_confirmation",
            setting_value: { cadence_days: cadenceDays },
          },
          { onConflict: "setting_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.cadence }),
  });
}

export function usePropertyConfirmationHistory(propertyId: string | undefined) {
  return useQuery({
    enabled: !!propertyId,
    queryKey: propertyId ? keys.history(propertyId) : ["availability_confirmations", "none"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_availability_confirmations")
        .select("*, team_members(full_name)")
        .eq("property_id", propertyId!)
        .order("requested_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Records a confirmation response for a property: writes the history row,
 * updates the property's availability + last-confirmed tracking, schedules
 * the next confirmation due date from the configured cadence, and creates a
 * follow-up Task for the assigned agent due on that date - a self-scheduling
 * in-app reminder loop instead of a background cron job.
 */
export function useConfirmPropertyAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      response,
      notes,
      confirmedBy,
      assignedAgentId,
      propertyTitle,
      cadenceDays,
    }: {
      propertyId: string;
      response: "available" | "sold" | "rented" | "reserved" | "unavailable";
      notes?: string | null;
      confirmedBy: string | null;
      assignedAgentId: string | null;
      propertyTitle: string;
      cadenceDays: number;
    }) => {
      const now = new Date();
      const nextDue = new Date(now.getTime() + cadenceDays * 24 * 3600 * 1000);

      const { error: histErr } = await sb.from("property_availability_confirmations").insert({
        property_id: propertyId,
        requested_at: now.toISOString(),
        responded_at: now.toISOString(),
        responded_by: confirmedBy,
        response,
        notes: notes || null,
      });
      if (histErr) throw histErr;

      const { error: propErr } = await sb
        .from("properties")
        .update({
          availability: response,
          availability_last_confirmed_at: now.toISOString(),
          availability_confirmed_by: confirmedBy,
          availability_next_due_at: nextDue.toISOString(),
        })
        .eq("id", propertyId);
      if (propErr) throw propErr;

      if (assignedAgentId) {
        const { error: taskErr } = await sb.from("tasks").insert({
          title: `Confirm availability: ${propertyTitle}`,
          task_type: "availability_confirmation",
          due_at: nextDue.toISOString(),
          priority: "medium",
          status: "pending",
          property_id: propertyId,
          assigned_to: assignedAgentId,
          source: "availability_confirmation",
        });
        if (taskErr) throw taskErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: propertyKeys.detail(vars.propertyId) });
      qc.invalidateQueries({ queryKey: keys.history(vars.propertyId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** Queues an owner notification through the existing SMS/WhatsApp abstraction (honestly skipped if no provider is configured). */
export function useRequestOwnerAvailabilityConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ownerId,
      propertyId,
      propertyTitle,
      recipientName,
    }: {
      ownerId: string;
      propertyId: string;
      propertyTitle: string;
      recipientName: string | null;
    }) => {
      // The recipient phone is filled in on the server from the owner record, so the
      // browser never has to hold an owner number it may not be entitled to see.
      const { error } = await sb.from("scheduled_notifications").insert({
        event_type: "availability_confirmation",
        owner_id: ownerId,
        recipient_name: recipientName,
        body: `Hi${recipientName ? ` ${recipientName}` : ""}, could you confirm the current status of "${propertyTitle}"? Still available, reserved, sold, rented, or unavailable?`,
        related_table: "properties",
        related_id: propertyId,
        status: "pending",
        scheduled_for: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled_notifications"] }),
  });
}
