import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Task, type TaskInsert } from "@/lib/db";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters?: Record<string, unknown>) => ["tasks", "list", filters ?? {}] as const,
};

export function useTasks(opts?: {
  leadId?: string;
  ownerId?: string;
  propertyId?: string;
  status?: string | null;
  assignedTo?: string | null;
  dueBefore?: string;
  dueFrom?: string;
}) {
  const { leadId, ownerId, propertyId, status, assignedTo, dueBefore, dueFrom } = opts ?? {};
  return useQuery({
    queryKey: taskKeys.list({ leadId, ownerId, propertyId, status, assignedTo, dueBefore, dueFrom }),
    queryFn: async (): Promise<Task[]> => {
      let q = sb
        .from("tasks")
        .select("*, leads(full_name), team_members(full_name), owners(name), properties(title)")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (leadId) q = q.eq("lead_id", leadId);
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (propertyId) q = q.eq("property_id", propertyId);
      if (status) q = q.eq("status", status);
      if (assignedTo) q = q.eq("assigned_to", assignedTo);
      if (dueFrom) q = q.gte("due_at", dueFrom);
      if (dueBefore) q = q.lt("due_at", dueBefore);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
}

/** Which tasks the Overview is asking for. Row-level security still decides what the person may see at all. */
export type TaskScope =
  | { kind: "mine"; memberId: string | null }
  | { kind: "team"; memberIds: string[] }
  | { kind: "organisation" };

/**
 * Every task that is not finished, for the Overview lists. Today, Overdue and Upcoming are all derived from
 * this one dataset so a task can never fall between them. The scope is applied in the query: "mine" is only
 * tasks assigned to the person, whatever else they are allowed to see.
 */
export function useOpenTasks(scope?: TaskScope) {
  const key =
    scope?.kind === "mine"
      ? { scope: "mine", member: scope.memberId }
      : scope?.kind === "team"
        ? { scope: "team", members: [...scope.memberIds].sort().join(",") }
        : { scope: "organisation" };
  const disabled =
    (scope?.kind === "mine" && !scope.memberId) || (scope?.kind === "team" && scope.memberIds.length === 0);
  return useQuery({
    enabled: !disabled,
    queryKey: taskKeys.list({ open: true, ...key }),
    queryFn: async (): Promise<Task[]> => {
      let q = sb
        .from("tasks")
        .select("*, leads(full_name), team_members(full_name), owners(name), properties(title)")
        .not("status", "in", "(completed,cancelled)")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (scope?.kind === "mine") q = q.eq("assigned_to", scope.memberId!);
      if (scope?.kind === "team") q = q.in("assigned_to", scope.memberIds);
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
