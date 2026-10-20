import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

// Bulk Reassign / Archive / Delete for Leads and Owners. Every operation is a single database function that
// checks permission on the server for each record, so what happens here is only batching and reporting:
//   * large selections are sent in chunks, with progress;
//   * a chunk that fails does not discard the results of the chunks that succeeded;
//   * a permission error stops the run at once (the next chunk would fail the same way).

export type BulkEntity = "leads" | "owners";
export type BulkProgress = (done: number, total: number) => void;

export type BlockedRecord = { id: string; name: string; linked: Record<string, number> };

export type BulkReassignSummary = {
  requested: number;
  reassigned: number;
  unchanged: number;
  missing: number;
  failed: number;
  failureMessage: string | null;
};

export type BulkArchiveSummary = {
  requested: number;
  changed: number;
  unchanged: number;
  inaccessible: number;
  failed: number;
  failureMessage: string | null;
};

export type BulkDeleteSummary = {
  requested: number;
  deleted: number;
  deletedIds: string[];
  blocked: BlockedRecord[];
  inaccessible: number;
  failed: number;
  failureMessage: string | null;
};

const CHUNK_SIZE = 100;

type RpcError = { code?: string; message: string };

async function runInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T>,
  onProgress?: BulkProgress,
): Promise<{ results: T[]; failedCount: number; failureMessage: string | null }> {
  const results: T[] = [];
  let failedCount = 0;
  let failureMessage: string | null = null;
  let done = 0;
  onProgress?.(0, ids.length);
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      results.push(await run(chunk));
    } catch (e) {
      const err = e as RpcError;
      failedCount += chunk.length;
      failureMessage = failureMessage ?? err.message;
      if (err.code === "42501") {
        // Not permitted: the remaining chunks would be refused for the same reason.
        failedCount += ids.length - (i + chunk.length);
        break;
      }
    }
    done += chunk.length;
    onProgress?.(Math.min(done, ids.length), ids.length);
  }
  return { results, failedCount, failureMessage };
}

type ReassignRow = { reassigned: number; unchanged: number; missing: string[] };
type ArchiveRow = { changed: number; unchanged: number; inaccessible: number };
type DeleteRow = { deleted: number; deleted_ids: string[]; blocked: BlockedRecord[]; inaccessible: number };

function invalidateAfterAssignmentChange(qc: ReturnType<typeof useQueryClient>, entity: BulkEntity) {
  qc.invalidateQueries({ queryKey: [entity] });
  qc.invalidateQueries({ queryKey: ["assignment_events"] });
  qc.invalidateQueries({ queryKey: ["reassignment"] });
  // The agent dashboards, pipeline board and profiles all read from these.
  if (entity === "leads") {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["viewings"] });
    qc.invalidateQueries({ queryKey: ["refs"] });
  }
}

export function useBulkReassign(entity: BulkEntity) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ids: string[];
      toAgentId: string;
      reason?: string;
      onProgress?: BulkProgress;
    }): Promise<BulkReassignSummary> => {
      const { results, failedCount, failureMessage } = await runInChunks<ReassignRow>(
        input.ids,
        async (chunk) => {
          const args = { _ids: chunk, _to_agent_id: input.toAgentId, _reason: input.reason?.trim() || undefined };
          const { data, error } =
            entity === "leads"
              ? await sb.rpc("bulk_reassign_leads", args)
              : await sb.rpc("bulk_reassign_owners", args);
          if (error) throw error;
          return data as unknown as ReassignRow;
        },
        input.onProgress,
      );
      return {
        requested: input.ids.length,
        reassigned: results.reduce((n, r) => n + r.reassigned, 0),
        unchanged: results.reduce((n, r) => n + r.unchanged, 0),
        missing: results.reduce((n, r) => n + (r.missing?.length ?? 0), 0),
        failed: failedCount,
        failureMessage,
      };
    },
    onSettled: () => invalidateAfterAssignmentChange(qc, entity),
  });
}

export function useBulkArchive(entity: BulkEntity) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ids: string[];
      /** false restores archived records. */
      archive?: boolean;
      onProgress?: BulkProgress;
    }): Promise<BulkArchiveSummary> => {
      const archive = input.archive ?? true;
      const { results, failedCount, failureMessage } = await runInChunks<ArchiveRow>(
        input.ids,
        async (chunk) => {
          const { data, error } =
            entity === "leads"
              ? await sb.rpc("bulk_archive_leads", { _ids: chunk, _archive: archive })
              : await sb.rpc("bulk_archive_owners", { _ids: chunk, _archive: archive });
          if (error) throw error;
          return data as unknown as ArchiveRow;
        },
        input.onProgress,
      );
      return {
        requested: input.ids.length,
        changed: results.reduce((n, r) => n + r.changed, 0),
        unchanged: results.reduce((n, r) => n + r.unchanged, 0),
        inaccessible: results.reduce((n, r) => n + r.inaccessible, 0),
        failed: failedCount,
        failureMessage,
      };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [entity] });
      if (entity === "leads") qc.invalidateQueries({ queryKey: ["refs"] });
    },
  });
}

export function useBulkDelete(entity: BulkEntity) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; onProgress?: BulkProgress }): Promise<BulkDeleteSummary> => {
      const { results, failedCount, failureMessage } = await runInChunks<DeleteRow>(
        input.ids,
        async (chunk) => {
          const { data, error } =
            entity === "leads"
              ? await sb.rpc("bulk_delete_leads", { _ids: chunk })
              : await sb.rpc("bulk_delete_owners", { _ids: chunk });
          if (error) throw error;
          return data as unknown as DeleteRow;
        },
        input.onProgress,
      );
      return {
        requested: input.ids.length,
        deleted: results.reduce((n, r) => n + r.deleted, 0),
        deletedIds: results.flatMap((r) => r.deleted_ids ?? []),
        blocked: results.flatMap((r) => r.blocked ?? []),
        inaccessible: results.reduce((n, r) => n + r.inaccessible, 0),
        failed: failedCount,
        failureMessage,
      };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [entity] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["refs"] });
    },
  });
}
