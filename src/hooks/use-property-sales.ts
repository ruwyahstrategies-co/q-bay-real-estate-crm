import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import { propertyKeys } from "./use-properties";

/**
 * Sale history lives on the existing transactions ledger (transaction_type = 'sale'), so
 * accounting and the property profile read the same record. Reads and writes go through
 * RPCs: buyer contact, commission and payment details are only returned to accounting,
 * administrators and the responsible agent.
 */
export const saleKeys = {
  forProperty: (propertyId: string) => ["property-sales", propertyId] as const,
};

export function usePropertySales(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? saleKeys.forProperty(propertyId) : ["property-sales", "none"],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_property_sales", { _property_id: propertyId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type PropertySale = NonNullable<ReturnType<typeof usePropertySales>["data"]>[number];

export type SaleInput = {
  propertyId: string;
  saleId?: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  saleDate: string;
  salePrice: number;
  currency: string;
  agentId: string | null;
  commissionRate: number | null;
  commissionAmount: number | null;
  paymentStatus: "pending" | "partial" | "paid" | null;
  paymentDetails: string;
  notes: string;
  leadId?: string | null;
};

/** The record_property_sale RPC accepts NULL for these arguments; the generated types do not model that. */
const orNull = <T>(v: T | null | undefined): T => (v ?? null) as unknown as T;

export function useRecordPropertySale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput): Promise<string> => {
      const { data, error } = await sb.rpc("record_property_sale", {
        _property_id: input.propertyId,
        _buyer_name: input.buyerName,
        _buyer_phone: input.buyerPhone,
        _buyer_email: input.buyerEmail,
        _sale_date: input.saleDate,
        _sale_price: input.salePrice,
        _currency: input.currency,
        _agent_id: orNull(input.agentId),
        _commission_rate: orNull(input.commissionRate),
        _commission_amount: orNull(input.commissionAmount),
        _payment_status: orNull(input.paymentStatus),
        _payment_details: input.paymentDetails,
        _notes: input.notes,
        _lead_id: input.leadId ?? undefined,
        _sale_id: input.saleId ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: saleKeys.forProperty(vars.propertyId) });
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: propertyKeys.detail(vars.propertyId) });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
