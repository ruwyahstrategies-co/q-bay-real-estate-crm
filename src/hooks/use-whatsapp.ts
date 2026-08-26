import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type AgentWhatsappConnection } from "@/lib/db";

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    const ctx: any = (error as any).context;
    let msg = error.message;
    try {
      const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
      if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}

/** The signed-in staff member's OWN WhatsApp Business connection — never anyone else's. */
export function useMyWhatsappConnection() {
  return useQuery({
    queryKey: ["whatsapp", "my-connection"],
    queryFn: async (): Promise<AgentWhatsappConnection | null> => {
      const { data: session } = await sb.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return null;
      const { data: tm } = await sb.from("team_members").select("id").eq("user_id", uid).maybeSingle();
      if (!tm) return null;
      const { data, error } = await sb.from("agent_whatsapp_connections").select("*").eq("team_member_id", tm.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Admin/manager view: which agents are connected (status only, never tokens). */
export function useTeamWhatsappStatus() {
  return useQuery({
    queryKey: ["whatsapp", "team-status"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("agent_whatsapp_connections")
        .select("team_member_id, connection_status, display_phone_number, last_verified_at, team_members(full_name)");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveWhatsappConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { phone_number_id: string; waba_id?: string; display_phone_number?: string; access_token?: string; webhook_verify_token?: string }) =>
      invoke<{ ok: true; connection: AgentWhatsappConnection }>("whatsapp-connection", { action: "save", ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "my-connection"] });
      qc.invalidateQueries({ queryKey: ["whatsapp", "team-status"] });
    },
  });
}

export function useDisconnectWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ ok: true }>("whatsapp-connection", { action: "disconnect" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "my-connection"] });
      qc.invalidateQueries({ queryKey: ["whatsapp", "team-status"] });
    },
  });
}

export function useVerifyWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ ok: boolean; connection?: AgentWhatsappConnection; error?: string }>("whatsapp-verify", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp", "my-connection"] }),
  });
}

export function useSendWhatsapp() {
  return useMutation({
    mutationFn: (input: { lead_id?: string; to: string; message?: string; template_name?: string; template_language?: string; template_params?: string[] }) =>
      invoke<{ ok: true; message_id: string | null }>("whatsapp-send", input),
  });
}
