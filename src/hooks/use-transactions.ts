import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type TransactionRow, type TransactionInsert, type TransactionUpdate } from "@/lib/db";

export const transactionKeys = {
  all: ["transactions"] as const,
  list: () => ["transactions", "list"] as const,
};

export function useTransactions() {
  return useQuery({
    queryKey: transactionKeys.list(),
    queryFn: async (): Promise<(TransactionRow & { properties: { title: string } | null; team_members: { full_name: string } | null })[]> => {
      const { data, error } = await sb
        .from("transactions")
        .select("*, properties(title), team_members(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransactionInsert) => {
      const { data, error } = await sb.from("transactions").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TransactionUpdate }) => {
      const { data, error } = await sb.from("transactions").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}
