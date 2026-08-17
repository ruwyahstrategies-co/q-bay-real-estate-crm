import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, PIPELINE_STAGES, type PipelineStageRow, type PipelineStageInsert, type PipelineStageUpdate } from "@/lib/db";
import { isMissingSchemaError } from "@/lib/db-extensions";

export const pipelineStageKeys = { all: ["pipeline_stages"] as const };

/**
 * Seed data used both as the frontend fallback (in case a client is ever
 * running against a schema that predates the pipeline_stages migration) and
 * as what the backend seeds as the initial row set when the table is empty.
 */
export const DEFAULT_PIPELINE_STAGES: PipelineStageRow[] = PIPELINE_STAGES.map((s, i) => ({
  id: s.key,
  organisation_id: null,
  stage_key: s.key,
  name: s.label,
  position: i,
  is_active: true,
  is_won: s.key === "won",
  is_lost: s.key === "lost",
  created_at: "",
  updated_at: "",
}));

export function usePipelineStages(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: [...pipelineStageKeys.all, { activeOnly }],
    queryFn: async (): Promise<PipelineStageRow[]> => {
      const { data, error } = await sb.from("pipeline_stages").select("*").order("position", { ascending: true });
      if (error) {
        if (isMissingSchemaError(error)) return DEFAULT_PIPELINE_STAGES;
        throw error;
      }
      const rows = data ?? [];
      if (rows.length === 0) return DEFAULT_PIPELINE_STAGES;
      return activeOnly ? rows.filter((r) => r.is_active) : rows;
    },
    staleTime: 30_000,
  });
}

export function stageLabelFrom(stages: PipelineStageRow[] | undefined, key: string): string {
  return stages?.find((s) => s.stage_key === key)?.name ?? key;
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PipelineStageInsert) => {
      const { data, error } = await sb.from("pipeline_stages").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineStageKeys.all }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PipelineStageUpdate }) => {
      const { data, error } = await sb.from("pipeline_stages").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineStageKeys.all }),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; position: number }[]) => {
      await Promise.all(
        ordered.map(({ id, position }) => sb.from("pipeline_stages").update({ position }).eq("id", id)),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineStageKeys.all }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: PipelineStageRow) => {
      const { count, error: countErr } = await sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_stage", stage.stage_key);
      if (countErr) throw countErr;
      if (count && count > 0) {
        throw new Error(
          `${count} lead(s) are currently in "${stage.name}". Move or reassign them before deleting this stage, or disable it instead.`,
        );
      }
      const { error } = await sb.from("pipeline_stages").delete().eq("id", stage.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineStageKeys.all }),
  });
}
