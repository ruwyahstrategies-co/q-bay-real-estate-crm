import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type MasterDataValue, type MasterDataValueUpdate } from "@/lib/db";
import type { MasterKind } from "@/lib/master-data";

export const masterDataKeys = {
  all: ["master_data_values"] as const,
  kind: (kind: MasterKind) => ["master_data_values", kind] as const,
};

/**
 * Approved Developers or Companies. Every signed-in staff member can read them (forms and
 * filters need the list); only people with settings.manage can change them (enforced by RLS).
 * Returns active and inactive rows; use buildMasterOptions() to turn them into form choices.
 */
export function useMasterData(kind: MasterKind) {
  return useQuery({
    queryKey: masterDataKeys.kind(kind),
    queryFn: async (): Promise<MasterDataValue[]> => {
      const { data, error } = await sb
        .from("master_data_values")
        .select("*")
        .eq("kind", kind)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function friendlyError(error: { code?: string; message: string }, kind: MasterKind): Error {
  if (error.code === "23505") {
    return new Error(`That ${kind} already exists in the list.`);
  }
  return new Error(error.message);
}

export function useCreateMasterValue(kind: MasterKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      const { data: last } = await sb
        .from("master_data_values")
        .select("display_order")
        .eq("kind", kind)
        .order("display_order", { ascending: false })
        .limit(1);
      const nextOrder = (last?.[0]?.display_order ?? -1) + 1;
      const { data, error } = await sb
        .from("master_data_values")
        .insert({ kind, name: trimmed, display_order: nextOrder })
        .select()
        .single();
      if (error) throw friendlyError(error, kind);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: masterDataKeys.all }),
  });
}

export function useUpdateMasterValue(kind: MasterKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MasterDataValueUpdate }) => {
      const next = patch.name === undefined ? patch : { ...patch, name: patch.name.trim() };
      const { data, error } = await sb
        .from("master_data_values")
        .update(next)
        .eq("id", id)
        .select()
        .single();
      if (error) throw friendlyError(error, kind);
      return data;
    },
    // A rename also rewrites the legacy text on linked records, so lists that show it must refetch.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: masterDataKeys.all });
      qc.invalidateQueries({ queryKey: ["developments"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}
