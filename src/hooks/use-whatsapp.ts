import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type AgentWhatsappConnection, type Tables } from "@/lib/db";

/** An error from a WhatsApp function. `code` is set when the server answered (so the outcome is known). */
export class WhatsappError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    const ctx: any = (error as any).context;
    let msg = error.message;
    let code: string | null = null;
    try {
      const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
      if (txt) {
        const p = JSON.parse(txt);
        if (p?.error) msg = p.error;
        if (typeof p?.code === "string") code = p.code;
      }
    } catch { /* ignore */ }
    throw new WhatsappError(msg, code);
  }
  return data as T;
}

export const whatsappKeys = {
  all: ["whatsapp-inbox"] as const,
  status: ["whatsapp", "status"] as const,
  conversations: ["whatsapp-inbox", "conversations"] as const,
  thread: (id: string) => ["whatsapp-inbox", "thread", id] as const,
  templates: ["whatsapp-inbox", "templates"] as const,
  lead: (leadId: string) => ["whatsapp-inbox", "lead", leadId] as const,
};

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
        .select("team_member_id, scope, connection_status, display_phone_number, last_verified_at, team_members(full_name)");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveWhatsappConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      scope?: "agent" | "company";
      phone_number_id: string;
      waba_id?: string;
      display_phone_number?: string;
      access_token?: string;
      webhook_verify_token?: string;
    }) => invoke<{ ok: true; connection: AgentWhatsappConnection }>("whatsapp-connection", { action: "save", ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "my-connection"] });
      qc.invalidateQueries({ queryKey: ["whatsapp", "team-status"] });
      qc.invalidateQueries({ queryKey: whatsappKeys.status });
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
      qc.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export function useVerifyWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ ok: boolean; connection?: AgentWhatsappConnection; error?: string }>("whatsapp-verify", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "my-connection"] });
      qc.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export type SendWhatsappInput = {
  /** Messages go to a lead. The number is read from the lead on the server, never typed or sent from here. */
  lead_id: string;
  message?: string;
  template?: { name: string; language: string; params: string[] };
  media?: { kind: "image" | "document" | "audio" | "video"; url: string; caption?: string; filename?: string };
  /** One id per deliberate send. Sending again with the same id never sends twice. */
  client_request_id?: string;
  /** The sender confirms this person agreed to receive WhatsApp messages (needed for a first template). */
  opt_in_confirmed?: boolean;
};

export type SendWhatsappResult = {
  ok: true;
  message_id: string;
  wa_message_id?: string | null;
  status: string;
  duplicate?: boolean;
};

/** Plain (non-hook) send through the configured WhatsApp number; throws unless the message was accepted. */
export function sendWhatsappMessage(input: SendWhatsappInput) {
  return invoke<SendWhatsappResult>("whatsapp-send", input);
}

export function useSendWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendWhatsappInput) => sendWhatsappMessage(input),
    onSettled: () => qc.invalidateQueries({ queryKey: whatsappKeys.all }),
  });
}

// ---------------------------------------------------------------- inbox

export type WhatsappConversation = Tables["whatsapp_conversations"]["Row"] & {
  leads: { id: string; full_name: string; assigned_agent_id: string | null } | null;
};
export type WhatsappMedia = Tables["whatsapp_message_media"]["Row"];
export type WhatsappMessage = Tables["whatsapp_messages"]["Row"] & { whatsapp_message_media: WhatsappMedia[] };
export type WhatsappTemplate = Tables["whatsapp_templates"]["Row"];

export type WhatsappStatus = {
  ok: true;
  live_enabled: boolean;
  app_secret_configured: boolean;
  verify_token_configured: boolean;
  mode: "shared" | "individual" | "undecided";
  webhook_url: string;
  company_connection: Pick<
    AgentWhatsappConnection,
    "id" | "team_member_id" | "phone_number_id" | "waba_id" | "display_phone_number" | "connection_status" | "last_verified_at" | "last_error"
  > | null;
  can_manage: boolean;
};

/** Is live messaging on, is the webhook configured, which number model is chosen. Never any secret values. */
export function useWhatsappStatus() {
  return useQuery({
    queryKey: whatsappKeys.status,
    queryFn: () => invoke<WhatsappStatus>("whatsapp-connection", { action: "status" }),
    staleTime: 30_000,
  });
}

export function useSetWhatsappMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "shared" | "individual" | "undecided") =>
      invoke<{ ok: true; mode: string }>("whatsapp-connection", { action: "set_mode", mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.status }),
  });
}

const CONVERSATION_SELECT = "*, leads(id, full_name, assigned_agent_id)";

/** Conversations the signed-in person may see. Row level security decides which; the screen adds nothing. */
export function useWhatsappConversations(enabled = true) {
  return useQuery({
    enabled,
    queryKey: whatsappKeys.conversations,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WhatsappConversation[]> => {
      const { data, error } = await sb
        .from("whatsapp_conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as WhatsappConversation[];
    },
  });
}

export function useWhatsappThread(conversationId: string | null) {
  return useQuery({
    enabled: !!conversationId,
    queryKey: whatsappKeys.thread(conversationId ?? ""),
    refetchInterval: 8_000,
    queryFn: async (): Promise<WhatsappMessage[]> => {
      const { data, error } = await sb
        .from("whatsapp_messages")
        .select("*, whatsapp_message_media(*)")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as WhatsappMessage[];
    },
  });
}

/** A lead's WhatsApp conversations (for the lead page): how many, and how many messages are unread. */
export function useLeadWhatsapp(leadId: string) {
  return useQuery({
    queryKey: whatsappKeys.lead(leadId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("whatsapp_conversations")
        .select("id, unread_count, last_message_at, last_message_preview")
        .eq("lead_id", leadId);
      if (error) throw error;
      const rows = data ?? [];
      return { conversations: rows, unread: rows.reduce((n, r) => n + (r.unread_count ?? 0), 0) };
    },
  });
}

export function useMarkWhatsappRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await sb.rpc("whatsapp_mark_conversation_read", { _conversation_id: conversationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.all }),
  });
}

export function useLinkWhatsappConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; leadId: string }) => {
      const { error } = await sb.rpc("whatsapp_link_conversation", {
        _conversation_id: input.conversationId,
        _lead_id: input.leadId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.all }),
  });
}

// ---------------------------------------------------------------- templates

export function useWhatsappTemplates(enabled = true) {
  return useQuery({
    enabled,
    queryKey: whatsappKeys.templates,
    queryFn: async (): Promise<WhatsappTemplate[]> => {
      const { data, error } = await sb.from("whatsapp_templates").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSyncWhatsappTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ ok: true; synced: number; approved: number }>("whatsapp-templates", { action: "sync" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.templates }),
  });
}

export function useRegisterWhatsappTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { waba_id: string; name: string; language: string; body_text: string; category?: string; status?: string }) =>
      invoke<{ ok: true }>("whatsapp-templates", { action: "upsert_manual", ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.templates }),
  });
}

// ---------------------------------------------------------------- media

/**
 * Opens a received picture or document. The server fetches it from Meta with the connection's token and passes
 * the bytes through; the browser never sees a token. Returns a temporary object URL.
 */
export async function fetchWhatsappMedia(mediaRowId: string): Promise<{ url: string; type: string }> {
  const { data: session } = await sb.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${import.meta.env["VITE_SUPABASE_URL"]}/functions/v1/whatsapp-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ media_row_id: mediaRowId }),
  });
  if (!res.ok) {
    let msg = "Could not open this file.";
    try {
      msg = (await res.json())?.error ?? msg;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}
