import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Team, type TeamInsert, type TeamUpdate } from "@/lib/db";

export const teamsKeys = {
  all: ["teams"] as const,
  list: () => ["teams", "list"] as const,
};

export function useTeams() {
  return useQuery({
    queryKey: teamsKeys.list(),
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await sb.from("teams").select("*").order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TeamInsert) => {
      const { data, error } = await sb.from("teams").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKeys.all }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TeamUpdate }) => {
      const { data, error } = await sb.from("teams").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKeys.all }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKeys.all }),
  });
}
