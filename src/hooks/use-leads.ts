import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type LeadInsert, type LeadUpdate, type Lead } from "@/lib/db";

export const leadsKeys = {
  all: ["leads"] as const,
  list: (filters?: Record<string, unknown>) => ["leads", "list", filters ?? {}] as const,
  detail: (id: string) => ["leads", "detail", id] as const,
};

export function useLeads(opts?: {
  search?: string;
  stage?: string | null;
  agent?: string | null;
  status?: "active" | "archived" | "all";
  classification?: string | null;
  workflow?: string | null;
  developmentId?: string | null;
}) {
  const { search = "", stage = null, agent = null, status = "active", classification = null, workflow = null, developmentId = null } = opts ?? {};
  return useQuery({
    queryKey: leadsKeys.list({ search, stage, agent, status, classification, workflow, developmentId }),
    queryFn: async (): Promise<Lead[]> => {
      let q = sb.from("leads").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (stage) q = q.eq("pipeline_stage", stage);
      if (agent) q = q.eq("assigned_agent_id", agent);
      if (classification) q = q.eq("classification", classification);
      if (workflow) q = q.eq("workflow", workflow);
      if (developmentId) q = q.eq("development_id", developmentId);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: id ? leadsKeys.detail(id) : ["leads", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("leads").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadInsert) => {
      const { data, error } = await sb.from("leads").insert(input).select().single();
      if (error) throw error;
      // Pipeline history entry
      await sb.from("pipeline_history").insert({
        lead_id: data.id,
        previous_stage: null,
        new_stage: data.pipeline_stage,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadUpdate }) => {
      const { data, error } = await sb.from("leads").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.detail(vars.id) });
    },
  });
}

export function useChangePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newStage, previousStage }: { id: string; newStage: string; previousStage: string }) => {
      const { data, error } = await sb.from("leads").update({ pipeline_stage: newStage }).eq("id", id).select().single();
      if (error) throw error;
      const { error: histErr } = await sb.from("pipeline_history").insert({
        lead_id: id,
        previous_stage: previousStage,
        new_stage: newStage,
      });
      if (histErr) throw histErr;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("leads")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}
