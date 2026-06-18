import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type PropertyEvent = {
  id: string;
  property_id: string | null;
  lead_id: string | null;
  event_type:
    | "view" | "mention" | "enquiry" | "shortlist" | "brochure_download"
    | "link_sent" | "viewing_request" | "offer" | "rejection" | "closed_deal";
  source: string | null;
  source_ref: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export const EVENT_WEIGHTS: Record<PropertyEvent["event_type"], number> = {
  view: 1,
  mention: 1.5,
  enquiry: 3,
  shortlist: 4,
  brochure_download: 2,
  link_sent: 1.5,
  viewing_request: 6,
  offer: 9,
  rejection: -3,
  closed_deal: 12,
};

export const EVENT_LABELS: Record<PropertyEvent["event_type"], string> = {
  view: "View",
  mention: "Mention",
  enquiry: "Enquiry",
  shortlist: "Shortlist",
  brochure_download: "Brochure download",
  link_sent: "Link sent",
  viewing_request: "Viewing request",
  offer: "Offer",
  rejection: "Rejection",
  closed_deal: "Closed deal",
};

export const propertyEventKeys = {
  all: ["property_events"] as const,
  list: (sinceISO: string) => ["property_events", "list", sinceISO] as const,
};

export function usePropertyEvents(sinceISO: string) {
  return useQuery({
    queryKey: propertyEventKeys.list(sinceISO),
    queryFn: async (): Promise<PropertyEvent[]> => {
      const { data, error } = await (sb as any)
        .from("property_events")
        .select("*")
        .gte("occurred_at", sinceISO)
        .order("occurred_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as PropertyEvent[];
    },
  });
}

export function useRecordPropertyEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      property_id: string;
      event_type: PropertyEvent["event_type"];
      lead_id?: string | null;
      source?: string | null;
      source_ref?: string | null;
      weight?: number;
      metadata?: Record<string, unknown>;
    }) => {
      const weight = input.weight ?? EVENT_WEIGHTS[input.event_type] ?? 1;
      const { data, error } = await (sb as any)
        .from("property_events")
        .insert({ ...input, weight })
        .select()
        .single();
      if (error) throw error;
      return data as PropertyEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyEventKeys.all }),
  });
}

export function useScanMentions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.functions.invoke("scan-property-mentions", { body: {} });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; inserted: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyEventKeys.all }),
  });
}
