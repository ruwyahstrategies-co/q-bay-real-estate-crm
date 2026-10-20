import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type PickerLead = {
  id: string;
  full_name: string;
  pipeline_stage: string;
  assigned_agent_id: string | null;
  transaction_intent: string;
};

/** PostgREST treats commas, parentheses and wildcards as syntax inside an or() filter. */
function safeTerm(term: string): string {
  return term.replace(/[,()%_\\*]/g, " ").trim();
}

/**
 * Search the leads the signed-in person can see, by name, phone or email, in the database. Returns at most
 * `limit` matches, so it stays fast however many leads exist. Row-level security decides which leads appear.
 */
export function useLeadPicker(query: string, opts?: { limit?: number; enabled?: boolean }) {
  const { limit = 15, enabled = true } = opts ?? {};
  const term = safeTerm(query);
  return useQuery({
    enabled,
    queryKey: ["leads", "picker", { term, limit }],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<PickerLead[]> => {
      let q = sb
        .from("leads")
        .select("id, full_name, pipeline_stage, assigned_agent_id, transaction_intent")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (term) {
        const pat = `%${term}%`;
        q = q.or(`full_name.ilike.${pat},phone.ilike.${pat},email.ilike.${pat}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PickerLead[];
    },
  });
}

/** One lead's name and assigned agent (to show a locked lead, or to default the viewing's agent). */
export function useLeadBrief(id: string | null | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["leads", "brief", id ?? "none"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("leads")
        .select("id, full_name, pipeline_stage, assigned_agent_id")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
