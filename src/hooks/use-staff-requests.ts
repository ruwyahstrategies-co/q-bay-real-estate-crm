import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type StaffRequest, type StaffRequestInsert, type StaffRequestUpdate } from "@/lib/db";

export const staffRequestKeys = {
  all: ["staff_requests"] as const,
  list: ["staff_requests", "list"] as const,
};

/**
 * Every request the signed-in user may see. Who that is (own, assigned, team, everyone) is decided
 * by row level security on staff_requests, not here.
 */
export function useStaffRequests() {
  return useQuery({
    queryKey: staffRequestKeys.list,
    queryFn: async (): Promise<StaffRequest[]> => {
      const { data, error } = await sb
        .from("staff_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Send a request. The requester, their team and the Submitted status are set by the database. */
export function useCreateStaffRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<StaffRequestInsert, "title" | "description" | "category" | "priority">,
    ) => {
      const { data, error } = await sb.from("staff_requests").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffRequestKeys.all }),
  });
}

/**
 * Update a request. What may change depends on who is asking and is enforced by the database:
 * the requester can edit or withdraw while it is still Submitted; a manager can assign, change
 * the status and respond.
 */
export function useUpdateStaffRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StaffRequestUpdate }) => {
      const { data, error } = await sb
        .from("staff_requests")
        .update(patch)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "This request could not be changed. It may have moved on or you may not have access.",
        );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffRequestKeys.all }),
  });
}
