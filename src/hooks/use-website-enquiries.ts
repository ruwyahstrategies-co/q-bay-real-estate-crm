import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type WebsiteEnquiry } from "@/lib/db";

export const websiteEnquiryKeys = {
  all: ["website_enquiries"] as const,
  list: () => ["website_enquiries", "list"] as const,
};

export function useWebsiteEnquiries() {
  return useQuery({
    queryKey: websiteEnquiryKeys.list(),
    queryFn: async (): Promise<(WebsiteEnquiry & { properties: { title: string } | null; team_members: { full_name: string } | null })[]> => {
      const { data, error } = await sb
        .from("website_enquiries")
        .select("*, properties(title), team_members(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useAssignWebsiteEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assigned_agent_id }: { id: string; assigned_agent_id: string }) => {
      const { data, error } = await sb.from("website_enquiries").update({ assigned_agent_id }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: websiteEnquiryKeys.all }),
  });
}
