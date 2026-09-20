import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type PropertyShareUpdate } from "@/lib/db";
import { sendWhatsappMessage } from "@/hooks/use-whatsapp";

export const propertyShareKeys = {
  all: ["property_shares"] as const,
  byProperty: (propertyId: string) => ["property_shares", "property", propertyId] as const,
  byLead: (leadId: string) => ["property_shares", "lead", leadId] as const,
};

export type PropertyShareRow = {
  id: string;
  property_id: string;
  lead_id: string;
  shared_by: string | null;
  channel: string;
  status: string;
  message: string | null;
  external_message_id: string | null;
  delivery_error: string | null;
  shared_at: string;
  leads: { id: string; full_name: string; phone: string | null } | null;
  properties: { id: string; title: string; reference_code: string | null } | null;
  team_members: { full_name: string } | null;
};

const SHARE_SELECT =
  "id, property_id, lead_id, shared_by, channel, status, message, external_message_id, delivery_error, shared_at, leads(id, full_name, phone), properties(id, title, reference_code), team_members(full_name)";

/** Every share of one property, newest first (only leads the caller can see come back, enforced by RLS). */
export function usePropertyShares(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? propertyShareKeys.byProperty(propertyId) : ["property_shares", "none"],
    enabled: !!propertyId,
    queryFn: async (): Promise<PropertyShareRow[]> => {
      const { data, error } = await sb
        .from("property_shares")
        .select(SHARE_SELECT)
        .eq("property_id", propertyId!)
        .order("shared_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PropertyShareRow[];
    },
  });
}

/** Every property shared with one lead, newest first. */
export function useLeadPropertyShares(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? propertyShareKeys.byLead(leadId) : ["property_shares", "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<PropertyShareRow[]> => {
      const { data, error } = await sb
        .from("property_shares")
        .select(SHARE_SELECT)
        .eq("lead_id", leadId!)
        .order("shared_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PropertyShareRow[];
    },
  });
}

export const SHARE_STATUS_LABELS: Record<string, string> = {
  recorded: "Recorded in CRM only (not delivered externally)",
  sent: "Sent via WhatsApp",
  failed: "External send failed",
};

export type SharePropertyInput = {
  propertyId: string;
  leads: { id: string; phone: string | null }[];
  message: string;
  /** One id per share action; a repeated submit with the same id is ignored by the database. */
  batchId: string;
  /** Only true when the caller has a verified WhatsApp connection AND chose to send. */
  sendViaWhatsapp: boolean;
};

export type SharePropertyResult = {
  recorded: number;
  duplicates: number;
  whatsapp: { attempted: boolean; sent: number; failed: number; firstError: string | null };
};

/**
 * Records a property share for each selected lead, then (only when asked, and
 * only through the caller's own connected WhatsApp) tries to deliver it. The
 * CRM record is written first and never depends on external delivery; a share
 * is marked "sent" only after the provider accepted the message.
 */
export function useSharePropertyWithLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SharePropertyInput): Promise<SharePropertyResult> => {
      if (input.leads.length === 0) throw new Error("Select at least one lead");

      const rows = input.leads.map((l) => ({
        property_id: input.propertyId,
        lead_id: l.id,
        share_batch_id: input.batchId,
        channel: "crm",
        status: "recorded",
        message: input.message || null,
      }));
      const { data: inserted, error } = await sb
        .from("property_shares")
        .upsert(rows, { onConflict: "share_batch_id,lead_id", ignoreDuplicates: true })
        .select("id, lead_id");
      if (error) {
        if (error.code === "42501") {
          throw new Error("You do not have permission to share this property with one or more of these leads.");
        }
        throw new Error(error.message);
      }

      const created = inserted ?? [];
      const result: SharePropertyResult = {
        recorded: created.length,
        duplicates: input.leads.length - created.length,
        whatsapp: { attempted: input.sendViaWhatsapp, sent: 0, failed: 0, firstError: null },
      };

      if (input.sendViaWhatsapp) {
        for (const row of created) {
          const lead = input.leads.find((l) => l.id === row.lead_id);
          let patch: PropertyShareUpdate;
          if (!lead?.phone) {
            patch = { channel: "whatsapp", status: "failed", delivery_error: "Lead has no phone number" };
          } else {
            try {
              const res = await sendWhatsappMessage({
                lead_id: lead.id,
                to: lead.phone,
                message: input.message,
              });
              patch = {
                channel: "whatsapp",
                status: "sent",
                external_message_id: res.message_id,
                delivery_error: null,
              };
            } catch (e) {
              patch = { channel: "whatsapp", status: "failed", delivery_error: (e as Error).message };
            }
          }
          const { error: updateError } = await sb.from("property_shares").update(patch).eq("id", row.id);
          if (patch.status === "sent") {
            result.whatsapp.sent += 1;
            // The message did go out; if only the status write failed, say so instead of hiding it.
            if (updateError) result.whatsapp.firstError ??= `Sent, but the CRM record could not be updated: ${updateError.message}`;
          } else {
            result.whatsapp.failed += 1;
            result.whatsapp.firstError ??= patch.delivery_error ?? null;
          }
        }
      }
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyShareKeys.all }),
  });
}
