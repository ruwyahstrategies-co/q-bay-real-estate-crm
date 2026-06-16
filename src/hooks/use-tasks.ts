import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Task, type TaskInsert } from "@/lib/db";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters?: Record<string, unknown>) => ["tasks", "list", filters ?? {}] as const,
};

export function useTasks(opts?: { leadId?: string; status?: string | null }) {
  const { leadId, status } = opts ?? {};
  return useQuery({
    queryKey: taskKeys.list({ leadId, status }),
    queryFn: async (): Promise<Task[]> => {
      let q = sb
        .from("tasks")
        .select("*, leads(full_name), team_members(full_name)")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (leadId) q = q.eq("lead_id", leadId);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInsert) => {
      const { data, error } = await sb.from("tasks").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data, error } = await sb.from("tasks").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
