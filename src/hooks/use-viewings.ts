import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sb, type Viewing, type ViewingUpdate } from "@/lib/db";

// Viewings. One viewing is ONE row, linked to its lead, its property and its agent. Every screen reads that
// same row: the lead profile, the property profile, the Viewings page and the Calendar. Scheduling,
// rescheduling, cancelling and completing go through database functions that validate the change, keep the
// history (viewing_events) and, for scheduling, move the lead to "Viewing Scheduled" in the same transaction.

export const viewingKeys = {
  all: ["viewings"] as const,
  list: (filters?: Record<string, unknown>) => ["viewings", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["viewings", "lead", leadId] as const,
  byProperty: (propertyId: string) => ["viewings", "property", propertyId] as const,
  detail: (id: string) => ["viewings", "detail", id] as const,
  events: (id: string) => ["viewings", "events", id] as const,
};

export type ViewingWithRelations = Viewing & {
  leads: { id: string; full_name: string; assigned_agent_id: string | null } | null;
  properties: { id: string; title: string; reference_code: string | null; property_number_label?: string | null } | null;
};

const VIEWING_SELECT = "*, leads(id, full_name, assigned_agent_id), properties(id, title, reference_code, property_number_label)";

export function useViewings(opts?: { agentId?: string; status?: string; from?: string; to?: string }) {
  const { agentId, status, from, to } = opts ?? {};
  return useQuery({
    queryKey: viewingKeys.list(opts as Record<string, unknown>),
    queryFn: async (): Promise<ViewingWithRelations[]> => {
      let q = sb.from("viewings").select(VIEWING_SELECT).order("scheduled_at", { ascending: true });
      if (agentId) q = q.eq("assigned_agent_id", agentId);
      if (status) q = q.eq("status", status);
      if (from) q = q.gte("scheduled_at", from);
      if (to) q = q.lte("scheduled_at", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ViewingWithRelations[];
    },
  });
}

export function useViewing(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? viewingKeys.detail(id) : ["viewings", "detail", "none"],
    enabled: !!id,
    queryFn: async (): Promise<ViewingWithRelations | null> => {
      const { data, error } = await sb.from("viewings").select(VIEWING_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as unknown as ViewingWithRelations) ?? null;
    },
  });
}

/** Every viewing for a lead, with the property being viewed. */
export function useLeadViewings(leadId: string | undefined) {
  return useQuery({
    queryKey: leadId ? viewingKeys.byLead(leadId) : ["viewings", "lead", "none"],
    enabled: !!leadId,
    queryFn: async (): Promise<ViewingWithRelations[]> => {
      const { data, error } = await sb
        .from("viewings")
        .select(VIEWING_SELECT)
        .eq("lead_id", leadId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ViewingWithRelations[];
    },
  });
}

/** Every viewing for a property, with the lead who is coming. */
export function usePropertyViewings(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? viewingKeys.byProperty(propertyId) : ["viewings", "property", "none"],
    enabled: !!propertyId,
    queryFn: async (): Promise<ViewingWithRelations[]> => {
      const { data, error } = await sb
        .from("viewings")
        .select(VIEWING_SELECT)
        .eq("property_id", propertyId!)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ViewingWithRelations[];
    },
  });
}

export type ViewingEvent = {
  id: string;
  viewing_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  from_scheduled_at: string | null;
  to_scheduled_at: string | null;
  note: string | null;
  actor_team_member_id: string | null;
  created_at: string;
};

export function useViewingEvents(viewingId: string | null | undefined) {
  return useQuery({
    queryKey: viewingId ? viewingKeys.events(viewingId) : ["viewings", "events", "none"],
    enabled: !!viewingId,
    queryFn: async (): Promise<ViewingEvent[]> => {
      const { data, error } = await sb
        .from("viewing_events")
        .select("id, viewing_id, action, from_status, to_status, from_scheduled_at, to_scheduled_at, note, actor_team_member_id, created_at")
        .eq("viewing_id", viewingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ViewingEvent[];
    },
  });
}

/** A viewing changed: refresh everything that shows it, and the lead whose stage may have moved with it. */
function refreshAfterViewingChange(qc: QueryClient, leadId?: string | null) {
  qc.invalidateQueries({ queryKey: viewingKeys.all });
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["pipeline_history", leadId ?? undefined] });
  qc.invalidateQueries({ queryKey: ["pipeline_history"] });
  qc.invalidateQueries({ queryKey: ["refs"] });
}

export type ScheduleViewingInput = {
  leadId: string;
  propertyId: string;
  scheduledAt: string;
  agentId?: string | null;
  notes?: string | null;
};

export type ScheduleViewingResult = {
  viewing_id: string;
  duplicate: boolean;
  stage_advanced: boolean;
  previous_stage?: string | null;
  new_stage?: string | null;
};

export function useScheduleViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleViewingInput): Promise<ScheduleViewingResult> => {
      const { data, error } = await sb.rpc("schedule_viewing", {
        _lead_id: input.leadId,
        _property_id: input.propertyId,
        _scheduled_at: input.scheduledAt,
        _agent_id: input.agentId ?? undefined,
        _notes: input.notes ?? undefined,
      });
      if (error) throw error;
      return data as unknown as ScheduleViewingResult;
    },
    onSettled: (_d, _e, vars) => refreshAfterViewingChange(qc, vars.leadId),
  });
}

/** Moves an existing viewing to a new time (and optionally another property or agent). Same id, same links. */
export function useRescheduleViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      scheduledAt: string;
      propertyId?: string | null;
      agentId?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await sb.rpc("reschedule_viewing", {
        _viewing_id: input.id,
        _scheduled_at: input.scheduledAt,
        _property_id: input.propertyId ?? undefined,
        _agent_id: input.agentId ?? undefined,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { viewing_id: string; unchanged: boolean };
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}

/** Cancels the appointment. The lead keeps its pipeline stage. */
export function useCancelViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string | null }) => {
      const { error } = await sb.rpc("cancel_viewing", { _viewing_id: input.id, _reason: input.reason ?? undefined });
      if (error) throw error;
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}

export function useCompleteViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; notes?: string | null; latitude?: number | null; longitude?: number | null }) => {
      const { error } = await sb.rpc("complete_viewing", {
        _viewing_id: input.id,
        _notes: input.notes ?? undefined,
        _latitude: input.latitude ?? undefined,
        _longitude: input.longitude ?? undefined,
      });
      if (error) throw error;
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}

export function useConfirmViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("confirm_viewing", { _viewing_id: id });
      if (error) throw error;
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}

/** Plain edit of non-scheduling fields (for example notes). Scheduling changes use the functions above. */
export function useUpdateViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ViewingUpdate }) => {
      const { data, error } = await sb.from("viewings").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}

export function useDeleteViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("viewings").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => refreshAfterViewingChange(qc),
  });
}
