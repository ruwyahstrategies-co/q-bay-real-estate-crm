import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type StaffSession, type StaffActivityEvent } from "@/lib/db";

export function useStaffSessions() {
  return useQuery({
    queryKey: ["staff_sessions", "list"],
    queryFn: async (): Promise<(StaffSession & { team_members: { full_name: string } | null })[]> => {
      const { data, error } = await sb
        .from("staff_sessions")
        .select("*, team_members(full_name)")
        .order("checked_in_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useMyOpenSession(teamMemberId: string | undefined) {
  return useQuery({
    queryKey: ["staff_sessions", "open", teamMemberId ?? "none"],
    enabled: !!teamMemberId,
    queryFn: async (): Promise<StaffSession | null> => {
      const { data, error } = await sb
        .from("staff_sessions")
        .select("*")
        .eq("team_member_id", teamMemberId!)
        .is("checked_out_at", null)
        .order("checked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamMemberId, latitude, longitude }: { teamMemberId: string; latitude?: number; longitude?: number }) => {
      const { data, error } = await sb
        .from("staff_sessions")
        .insert({ team_member_id: teamMemberId, check_in_latitude: latitude, check_in_longitude: longitude })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_sessions"] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, latitude, longitude }: { id: string; latitude?: number; longitude?: number }) => {
      const { data, error } = await sb
        .from("staff_sessions")
        .update({ checked_out_at: new Date().toISOString(), check_out_latitude: latitude, check_out_longitude: longitude })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_sessions"] }),
  });
}

export function useStaffActivityEvents(teamMemberId?: string) {
  return useQuery({
    queryKey: ["staff_activity_events", teamMemberId ?? "all"],
    queryFn: async (): Promise<StaffActivityEvent[]> => {
      let q = sb.from("staff_activity_events").select("*").order("occurred_at", { ascending: false }).limit(300);
      if (teamMemberId) q = q.eq("team_member_id", teamMemberId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLogActivityEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { team_member_id: string; event_type: string; lead_id?: string; property_id?: string; viewing_id?: string; metadata?: Record<string, unknown> }) => {
      const { error } = await sb.from("staff_activity_events").insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_activity_events"] }),
  });
}
