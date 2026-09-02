import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type MarketingRequest, type MarketingRequestUpdate } from "@/lib/db";

export const marketingRequestKeys = {
  all: ["marketing_requests"] as const,
  list: (status?: string | null) => ["marketing_requests", "list", status ?? "all"] as const,
};

type MarketingRequestRow = MarketingRequest & {
  properties: {
    id: string;
    title: string;
    reference_code: string | null;
    property_type: string | null;
    status: string;
    development_id: string | null;
    area_id: string | null;
    assigned_agent_id: string | null;
    developments: { name: string } | null;
    areas: { name: string } | null;
  } | null;
  team_members: { full_name: string } | null;
};

export function useMarketingRequests(status?: "pending" | "in_progress" | "completed" | null) {
  return useQuery({
    queryKey: marketingRequestKeys.list(status),
    queryFn: async (): Promise<MarketingRequestRow[]> => {
      let q = sb
        .from("marketing_requests")
        .select("*, properties(id, title, reference_code, property_type, status, development_id, area_id, assigned_agent_id, developments(name), areas(name)), team_members(full_name)")
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as MarketingRequestRow[];
    },
  });
}

export function useUpdateMarketingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MarketingRequestUpdate }) => {
      const { data, error } = await sb.from("marketing_requests").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingRequestKeys.all }),
  });
}
