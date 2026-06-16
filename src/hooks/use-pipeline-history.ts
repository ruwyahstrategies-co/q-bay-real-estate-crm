import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export function usePipelineHistory(leadId: string | undefined) {
  return useQuery({
    queryKey: ["pipeline_history", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("pipeline_history")
        .select("*")
        .eq("lead_id", leadId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
