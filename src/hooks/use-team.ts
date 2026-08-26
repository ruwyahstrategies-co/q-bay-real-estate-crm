import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type TeamMember, type TeamMemberInsert } from "@/lib/db";
import type { PermissionSet } from "@/lib/permissions";
import type { StaffTeamMember } from "@/lib/db-extensions";

export const teamKeys = {
  all: ["team_members"] as const,
  list: ["team_members", "list"] as const,
};

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    let msg = error.message;
    try {
      const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
      if (txt) {
        const p = JSON.parse(txt);
        if (p?.error) msg = p.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return data as T;
}

export function useTeamMembers() {
  return useQuery({
    queryKey: teamKeys.list,
    queryFn: async (): Promise<StaffTeamMember[]> => {
      const { data, error } = await sb.from("team_members").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StaffTeamMember[];
    },
  });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TeamMemberInsert & { permissions?: PermissionSet | null }) => {
      const { data, error } = await sb.from("team_members").insert(input as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TeamMember> & { permissions?: PermissionSet | null } }) => {
      const { data, error } = await sb.from("team_members").update(patch as never).eq("id", id).select().single();
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

export type CreateStaffUserInput = {
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  team_id?: string | null;
  permissions: PermissionSet;
  temporary_password: string;
  is_active: boolean;
};

/** Creates a real Supabase Auth login for a staff member via a secure edge function. */
export function useCreateStaffUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffUserInput) =>
      invokeEdgeFunction<{ team_member: StaffTeamMember; auth_user_id: string; warning: string | null }>(
        "admin-create-staff-user",
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: (input: { team_member_id: string; new_password: string }) =>
      invokeEdgeFunction<{ ok: true }>("admin-manage-staff", { action: "reset_password", ...input }),
  });
}

/** Suspends or restores a staff member's login, in addition to the is_active flag. */
export function useSetStaffActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { team_member_id: string; is_active: boolean }) =>
      invokeEdgeFunction<{ ok: true }>("admin-manage-staff", { action: "set_active", ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}
