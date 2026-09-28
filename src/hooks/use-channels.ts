import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type LeadChannel, type LeadChannelInsert, type LeadChannelUpdate } from "@/lib/db";

export const channelKeys = { all: ["lead_channels"] as const };

/** Configured Lead Sources / Channels (Settings > Channels). Drives the "Lead source" picker. */
export function useLeadChannels(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: [...channelKeys.all, { activeOnly }],
    queryFn: async (): Promise<LeadChannel[]> => {
      const { data, error } = await sb
        .from("lead_channels")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      return activeOnly ? rows.filter((r) => r.is_active) : rows;
    },
    staleTime: 30_000,
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadChannelInsert) => {
      const { data, error } = await sb.from("lead_channels").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadChannelUpdate }) => {
      const { data, error } = await sb
        .from("lead_channels")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useReorderChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; display_order: number }[]) => {
      await Promise.all(
        ordered.map(({ id, display_order }) =>
          sb.from("lead_channels").update({ display_order }).eq("id", id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

/** Deletes a channel. Historical leads keep their lead_source string regardless (it's free
 * text, never a foreign key) - this only removes it from the picker's option list. */
export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("lead_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}
