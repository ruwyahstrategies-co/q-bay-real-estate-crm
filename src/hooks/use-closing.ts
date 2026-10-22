import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import { toNumber, type ClosingValues } from "@/lib/closing";

export type ClosingQueueProperty = {
  property_id: string;
  title: string;
  reference_code: string | null;
  price: number | null;
  currency: string | null;
  status: string | null;
  purpose: string | null;
};

export type ClosingQueueItem = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  pipeline_stage: string;
  transaction_intent: string | null;
  budget_max: number | null;
  currency: string | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  already_won: boolean | null;
  waiting_since: string;
  properties: ClosingQueueProperty[];
};

export const closingKeys = {
  queue: ["closing-queue"] as const,
};

/** Deals waiting for someone who can finalise them (Documentation, or Won without closing details). */
export function useClosingQueue(enabled: boolean) {
  return useQuery({
    queryKey: closingKeys.queue,
    enabled,
    queryFn: async (): Promise<ClosingQueueItem[]> => {
      const { data, error } = await sb.rpc("get_closing_queue");
      if (error) throw error;
      return (data as unknown as ClosingQueueItem[]) ?? [];
    },
  });
}

/** After a deal closes, every screen that shows leads, properties, sales or history must refresh. */
function invalidateAfterClosing(
  qc: ReturnType<typeof useQueryClient>,
  leadId?: string,
  propertyId?: string,
) {
  qc.invalidateQueries({ queryKey: closingKeys.queue });
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["transactions"] });
  qc.invalidateQueries({ queryKey: ["properties"] });
  qc.invalidateQueries({ queryKey: ["property-sales"] });
  qc.invalidateQueries({ queryKey: ["refs"] });
  qc.invalidateQueries({ queryKey: ["pipeline_history"] });
  qc.invalidateQueries({ queryKey: ["interactions"] });
  qc.invalidateQueries({ queryKey: ["staff-notifications"] });
  if (leadId) qc.invalidateQueries({ queryKey: ["leads", "detail", leadId] });
  if (propertyId) qc.invalidateQueries({ queryKey: ["properties", "detail", propertyId] });
}

export type CloseDealResult = { transaction_id: string; stage: string; summary: string };

export function useCloseLeadDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      leadId: string;
      values: ClosingValues;
      transactionId?: string | null;
    }): Promise<CloseDealResult> => {
      const v = input.values;
      const { data, error } = await sb.rpc("close_lead_deal", {
        _lead_id: input.leadId,
        _property_id: v.property_id,
        _transaction_type: v.transaction_type,
        _closing_date: v.closing_date,
        _price: toNumber(v.price) as number,
        _currency: v.currency || "QAR",
        _client_name: v.client_name.trim(),
        _client_phone: v.client_phone.trim(),
        _client_email: v.client_email.trim(),
        _payment_method: v.payment_method,
        _payment_status: v.payment_status,
        _payment_details: v.payment_details.trim(),
        _commission_rate: v.commission_rate.trim()
          ? (toNumber(v.commission_rate) as number)
          : undefined,
        _commission_amount: v.commission_amount.trim()
          ? (toNumber(v.commission_amount) as number)
          : undefined,
        _notes: v.notes.trim(),
        _transaction_id: input.transactionId ?? undefined,
      });
      if (error) throw error;
      return data as unknown as CloseDealResult;
    },
    onSettled: (_d, _e, vars) =>
      invalidateAfterClosing(qc, vars.leadId, vars.values.property_id || undefined),
  });
}

/** Which interested property is being negotiated; optionally also holds it as Reserved. */
export function useSetNegotiationProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; propertyId: string; holdProperty: boolean }) => {
      const { data, error } = await sb.rpc("set_negotiation_property", {
        _lead_id: input.leadId,
        _property_id: input.propertyId,
        _hold_property: input.holdProperty,
      });
      if (error) throw error;
      return data as unknown as { property_id: string; held: boolean };
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["refs"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["leads", "detail", vars.leadId] });
    },
  });
}
