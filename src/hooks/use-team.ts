import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type TeamMember, type TeamMemberInsert } from "@/lib/db";

export const teamKeys = {
  all: ["team_members"] as const,
  list: ["team_members", "list"] as const,
};

export function useTeamMembers() {
  return useQuery({
    queryKey: teamKeys.list,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await sb.from("team_members").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TeamMemberInsert) => {
      const { data, error } = await sb.from("team_members").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TeamMember> }) => {
      const { data, error } = await sb.from("team_members").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}
