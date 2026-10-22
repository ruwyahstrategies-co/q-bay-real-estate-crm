import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import type { Tables } from "@/integrations/supabase/types";
import { useCurrentUser } from "@/hooks/use-auth";
import type { ReassignMode } from "@/lib/reassignment";

export type ReassignmentRequest = Tables<"lead_reassignment_requests">;

export const reassignmentKeys = {
  all: ["lead-reassignments"] as const,
  pending: ["lead-reassignments", "pending"] as const,
  forLead: (leadId: string) => ["lead-reassignments", "lead", leadId] as const,
  mine: ["lead-reassignments", "mine"] as const,
};

/** Every open handover request the signed-in person is allowed to see, newest first. */
export function usePendingReassignments() {
  return useQuery({
    queryKey: reassignmentKeys.pending,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ReassignmentRequest[]> => {
      const { data, error } = await sb
        .from("lead_reassignment_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The open handover request for one lead, if any. */
export function usePendingReassignmentForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? reassignmentKeys.forLead(leadId) : ["lead-reassignments", "lead", "none"],
    enabled: !!leadId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ReassignmentRequest | null> => {
      const { data, error } = await sb
        .from("lead_reassignment_requests")
        .select("*")
        .eq("lead_id", leadId!)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Requests addressed to the signed-in agent: the ones waiting for an answer, and the recent outcomes. */
export function useMyReassignmentRequests() {
  const { teamMember } = useCurrentUser();
  return useQuery({
    queryKey: reassignmentKeys.mine,
    enabled: !!teamMember?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ReassignmentRequest[]> => {
      const { data, error } = await sb
        .from("lead_reassignment_requests")
        .select("*")
        .eq("to_agent_id", teamMember!.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ReassignmentRequestResult = {
  requested: number;
  created: number;
  skipped: { lead_id: string; reason: string }[];
  deadline_at: string;
  batch_id: string;
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: reassignmentKeys.all });
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["assignment_events"] });
  qc.invalidateQueries({ queryKey: ["pipeline_history"] });
  qc.invalidateQueries({ queryKey: ["staff-notifications"] });
}

export function useRequestLeadReassignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      leadIds: string[];
      toAgentId: string;
      mode: ReassignMode;
      deadlineMinutes: number;
      reason?: string;
    }): Promise<ReassignmentRequestResult> => {
      const { data, error } = await sb.rpc("request_lead_reassignment", {
        _lead_ids: input.leadIds,
        _to_agent_id: input.toAgentId,
        _mode: input.mode,
        _deadline_minutes: input.deadlineMinutes,
        _reason: input.reason?.trim() || undefined,
      });
      if (error) throw error;
      return data as unknown as ReassignmentRequestResult;
    },
    onSettled: () => invalidateAll(qc),
  });
}

export type ReassignmentResponse = {
  status: string;
  message?: string;
  lead_id?: string;
  mode?: string;
};

export function useRespondLeadReassignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      accept: boolean;
      note?: string;
    }): Promise<ReassignmentResponse> => {
      const { data, error } = await sb.rpc("respond_lead_reassignment", {
        _request_id: input.requestId,
        _accept: input.accept,
        _note: input.note?.trim() || undefined,
      });
      if (error) throw error;
      return data as unknown as ReassignmentResponse;
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useCancelLeadReassignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await sb.rpc("cancel_lead_reassignment", { _request_id: requestId });
      if (error) throw error;
    },
    onSettled: () => invalidateAll(qc),
  });
}

/**
 * Asks the database to expire handover requests whose deadline has passed. The database also does this
 * every minute on its own (pg_cron); doing it here as well means an open session never shows a request as
 * waiting when its time is up. Safe to repeat.
 */
export function useExpireOverdueReassignments(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const sweep = async () => {
      const { data, error } = await sb.rpc("expire_due_lead_reassignments");
      if (!cancelled && !error && typeof data === "number" && data > 0) invalidateAll(qc);
    };
    void sweep();
    const timer = setInterval(sweep, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, qc]);
}

/** Moves the signed-in team's leads when a member leaves: immediate, with the same two modes. */
export function useReassignMemberLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fromAgentId: string;
      toAgentId: string;
      mode: ReassignMode;
    }): Promise<number> => {
      const { data, error } = await sb.rpc("reassign_member_leads", {
        _from_agent_id: input.fromAgentId,
        _to_agent_id: input.toAgentId,
        _mode: input.mode,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSettled: () => invalidateAll(qc),
  });
}
