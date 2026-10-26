// What the WhatsApp inbox screen decides, kept out of the component so it can be tested.
// The same Meta rules are enforced again by the server and the database; this only makes the screen honest
// about them (what can be typed, what needs a template, what has been delivered).

import { WINDOW_HOURS } from "../../supabase/functions/_shared/whatsapp-core.ts";

export type WindowState = {
  open: boolean;
  closesAt: Date | null;
  /** Short line for the composer: how long the free-text window has left, or what to do instead. */
  label: string;
};

export function windowState(lastInboundAt: string | null | undefined, now: Date = new Date()): WindowState {
  if (!lastInboundAt) {
    return { open: false, closesAt: null, label: "No reply from this person yet. Start with an approved template." };
  }
  const closes = new Date(new Date(lastInboundAt).getTime() + WINDOW_HOURS * 3600 * 1000);
  const msLeft = closes.getTime() - now.getTime();
  if (!Number.isFinite(msLeft) || msLeft <= 0) {
    return { open: false, closesAt: Number.isFinite(closes.getTime()) ? closes : null, label: "The 24 hour window is closed. Send an approved template to continue." };
  }
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  return { open: true, closesAt: closes, label: `Free replies open for ${h > 0 ? `${h}h ` : ""}${m}m more.` };
}

export type ComposerMode = "text" | "template_only" | "blocked";

/** What the composer offers for a conversation right now. */
export function composerMode(
  conv: { last_inbound_at: string | null; opt_in_status: string } | null | undefined,
  now: Date = new Date(),
): ComposerMode {
  if (!conv) return "template_only";
  if (conv.opt_in_status === "opted_out") return "blocked";
  return windowState(conv.last_inbound_at, now).open ? "text" : "template_only";
}

export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

export function statusLabel(status: string): string {
  return MESSAGE_STATUS_LABEL[status] ?? status;
}

/** Fills a template body's {{1}}, {{2}} ... with the values sent, for showing what was sent. */
export function renderTemplateBody(body: string | null | undefined, params: unknown): string | null {
  if (!body) return null;
  const values = Array.isArray(params) ? params.map((p) => String(p ?? "")) : [];
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] ?? "");
}

type ThreadMessage = {
  id: string;
  direction: string;
  message_type: string;
  body: string | null;
  template_name: string | null;
  template_params: unknown;
  wa_timestamp: string | null;
  created_at: string;
};

/** The text to show for a message of any kind. */
export function messageDisplayText(m: ThreadMessage, templateBodies: Record<string, string | null> = {}): string {
  if (m.message_type === "template") {
    return renderTemplateBody(templateBodies[m.template_name ?? ""], m.template_params) ?? `[template: ${m.template_name ?? "message"}]`;
  }
  if (m.body && m.body.trim()) return m.body;
  return `[${m.message_type}]`;
}

export function messageTime(m: Pick<ThreadMessage, "wa_timestamp" | "created_at">): string {
  return m.wa_timestamp ?? m.created_at;
}

export type DayGroup<T> = { day: string; items: T[] };

/** Oldest first, grouped by calendar day (Qatar time, UTC+3) so a thread reads like a chat. */
export function groupByDay<T extends Pick<ThreadMessage, "wa_timestamp" | "created_at">>(messages: T[]): DayGroup<T>[] {
  const sorted = [...messages].sort((a, b) => messageTime(a).localeCompare(messageTime(b)));
  const groups: DayGroup<T>[] = [];
  for (const m of sorted) {
    const day = new Date(new Date(messageTime(m)).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  return groups;
}

export type ConversationFilter = { unreadOnly: boolean; search: string };

type ConversationLike = {
  contact_name: string | null;
  wa_id: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
};

/** Most recent first; unread and text search narrow the list. */
export function filterConversations<T extends ConversationLike>(
  list: T[],
  f: ConversationFilter,
  leadName: (c: T) => string | null = () => null,
): T[] {
  const q = f.search.trim().toLowerCase();
  return list
    .filter((c) => !f.unreadOnly || c.unread_count > 0)
    .filter((c) => {
      if (!q) return true;
      return [c.contact_name, leadName(c), c.wa_id, c.last_message_preview].some((v) => (v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
}

/** A new client_request_id for one deliberate send; reuse the same one when retrying that same message. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
