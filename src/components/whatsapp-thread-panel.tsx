import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Clock, FileText, Image as ImageIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-primitives";
import { MaskedPhone } from "@/components/masked-phone";
import { cn } from "@/lib/utils";
import {
  WhatsappError,
  fetchWhatsappMedia,
  useMarkWhatsappRead,
  useSendWhatsapp,
  useWhatsappThread,
  type WhatsappConversation,
  type WhatsappMedia,
  type WhatsappMessage,
  type WhatsappTemplate,
} from "@/hooks/use-whatsapp";
import {
  composerMode,
  groupByDay,
  messageDisplayText,
  newRequestId,
  renderTemplateBody,
  statusLabel,
  windowState,
} from "@/lib/whatsapp-inbox";
import { fmtDateTime } from "@/lib/db";

const inputCls =
  "w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";

/** Errors that mean the server answered and the attempt is over, so the next try must use a fresh request id. */
const DEFINITIVE = new Set([
  "window_closed", "recipient_opted_out", "opt_in_required", "forbidden", "not_activated", "no_connection", "not_verified",
  "template_not_found", "template_not_approved", "template_params", "meta_rejected", "meta_no_id", "network",
  "previous_attempt_failed", "invalid_recipient", "conversation_belongs_to_other_lead", "message_too_long", "empty_message",
]);

function StatusTick({ status }: { status: string }) {
  if (status === "failed") return <AlertTriangle className="h-3 w-3 text-destructive" aria-hidden />;
  if (status === "sending") return <Clock className="h-3 w-3" aria-hidden />;
  if (status === "sent") return <Check className="h-3 w-3" aria-hidden />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" aria-hidden />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-qbay" aria-hidden />;
  return null;
}

function MediaChip({ media }: { media: WhatsappMedia }) {
  const [state, setState] = useState<{ url: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (state) URL.revokeObjectURL(state.url); }, [state]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWhatsappMedia(media.id);
      if (media.media_kind === "image" || media.media_kind === "sticker") setState(res);
      else window.open(res.url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state && state.type.startsWith("image/")) {
    return <img src={state.url} alt={media.caption ?? "Picture sent on WhatsApp"} className="mt-1 max-h-64 rounded-lg" />;
  }
  const Icon = media.media_kind === "image" || media.media_kind === "sticker" ? ImageIcon : FileText;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {busy ? "Opening..." : media.filename || `Open ${media.media_kind}`}
      </button>
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function Bubble({ m, templateBodies }: { m: WhatsappMessage; templateBodies: Record<string, string | null> }) {
  const out = m.direction === "outbound";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-card sm:max-w-[70%]",
          out ? "rounded-br-md bg-qbay-tint text-foreground" : "rounded-bl-md border border-border bg-canvas",
        )}
      >
        {m.message_type === "template" ? (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Template</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{messageDisplayText(m, templateBodies)}</p>
        {m.whatsapp_message_media.map((x) => (
          <MediaChip key={x.id} media={x} />
        ))}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>{new Date(m.wa_timestamp ?? m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qatar" })}</span>
          {out ? (
            <span className="inline-flex items-center gap-0.5" title={m.error_text ?? statusLabel(m.status)}>
              <StatusTick status={m.status} />
              {m.status === "failed" ? <span className="text-destructive">Failed</span> : null}
            </span>
          ) : null}
        </div>
        {m.status === "failed" && m.error_text ? <p className="mt-0.5 text-[11px] text-destructive">{m.error_text}</p> : null}
      </div>
    </div>
  );
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function WhatsappThreadPanel({
  conversation,
  templates,
  canSend,
  liveEnabled,
  onBack,
}: {
  conversation: WhatsappConversation;
  templates: WhatsappTemplate[];
  canSend: boolean;
  liveEnabled: boolean;
  onBack: () => void;
}) {
  const { data: messages = [], isLoading } = useWhatsappThread(conversation.id);
  const send = useSendWhatsapp();
  const markRead = useMarkWhatsappRead();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState("");
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  const mode = composerMode(conversation);
  const win = windowState(conversation.last_inbound_at);
  const approved = useMemo(() => templates.filter((t) => t.status === "approved"), [templates]);
  const templateBodies = useMemo(() => Object.fromEntries(templates.map((t) => [t.name, t.body_text])), [templates]);
  const chosen = approved.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const showTemplate = mode === "template_only" || useTemplate;
  const needsOptIn = showTemplate && conversation.opt_in_status === "unknown";

  // Opening a conversation marks it read for the person looking at it.
  useEffect(() => {
    if (conversation.unread_count > 0) markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the open conversation or its unread count changes
  }, [conversation.id, conversation.unread_count]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation.id]);

  useEffect(() => {
    setText("");
    setUseTemplate(false);
    setTemplateKey("");
    setParams([]);
    setOptIn(false);
    setRequestId(newRequestId());
  }, [conversation.id]);

  useEffect(() => {
    setParams(Array.from({ length: chosen?.param_count ?? 0 }, () => ""));
  }, [chosen?.id, chosen?.param_count]);

  const title = conversation.leads?.full_name ?? conversation.contact_name ?? `+${conversation.wa_id}`;
  const canSubmit =
    canSend &&
    liveEnabled &&
    !send.isPending &&
    !!conversation.lead_id &&
    (showTemplate
      ? !!chosen && params.every((p) => p.trim()) && (!needsOptIn || optIn)
      : mode === "text" && !!text.trim());

  async function submit() {
    if (!conversation.lead_id || !canSubmit) return;
    try {
      await send.mutateAsync(
        showTemplate && chosen
          ? { lead_id: conversation.lead_id, template: { name: chosen.name, language: chosen.language, params }, client_request_id: requestId, opt_in_confirmed: optIn }
          : { lead_id: conversation.lead_id, message: text.trim(), client_request_id: requestId },
      );
      setText("");
      setRequestId(newRequestId());
    } catch (e) {
      toast.error((e as Error).message);
      // Keep the same id after a network-level failure (the message may have gone), take a new one after a definite answer.
      if (e instanceof WhatsappError && e.code && DEFINITIVE.has(e.code)) setRequestId(newRequestId());
    }
  }

  const groups = groupByDay(messages);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button type="button" onClick={onBack} className="rounded-md p-1.5 hover:bg-muted lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            <MaskedPhone value={`+${conversation.wa_id}`} />
            {conversation.lead_id ? (
              <>
                {" · "}
                <Link to="/leads/$leadId" params={{ leadId: conversation.lead_id }} className="underline-offset-2 hover:underline">
                  Open lead
                </Link>
              </>
            ) : (
              " · Not linked to a lead"
            )}
          </p>
        </div>
        {conversation.opt_in_status === "opted_out" ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">Opted out</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/40 px-3 py-4">
        {isLoading ? <p className="text-center text-xs text-muted-foreground">Loading...</p> : null}
        {!isLoading && messages.length === 0 ? <p className="text-center text-xs text-muted-foreground">No messages yet.</p> : null}
        {groups.map((g) => (
          <div key={g.day} className="space-y-2">
            <p className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(g.day)}</p>
            {g.items.map((m) => (
              <Bubble key={m.id} m={m} templateBodies={templateBodies} />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-canvas p-3">
        {!canSend ? (
          <p className="text-xs text-muted-foreground">You can read this conversation but do not have permission to send messages.</p>
        ) : !conversation.lead_id ? (
          <p className="text-xs text-muted-foreground">Link this conversation to a lead before replying.</p>
        ) : mode === "blocked" ? (
          <p className="text-xs text-destructive">This person opted out of WhatsApp messages. Do not message them here.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn("text-[11px]", win.open ? "text-muted-foreground" : "text-foreground")}>{win.label}</p>
              {mode === "text" ? (
                <button type="button" className="text-[11px] underline-offset-2 hover:underline" onClick={() => setUseTemplate((v) => !v)}>
                  {useTemplate ? "Write a message" : "Use a template"}
                </button>
              ) : null}
            </div>

            {showTemplate ? (
              <div className="space-y-2">
                <select className={inputCls} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} aria-label="Approved template">
                  <option value="">{approved.length ? "Choose an approved template..." : "No approved templates yet"}</option>
                  {approved.map((t) => (
                    <option key={t.id} value={`${t.name}|${t.language}`}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                {chosen ? (
                  <>
                    {params.map((p, i) => (
                      <input
                        key={i}
                        className={inputCls}
                        placeholder={`Value for {{${i + 1}}}`}
                        value={p}
                        onChange={(e) => setParams((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                    ))}
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {renderTemplateBody(chosen.body_text, params) ?? "(no preview available)"}
                    </p>
                  </>
                ) : null}
                {needsOptIn ? (
                  <label className="flex items-start gap-2 text-xs">
                    <input type="checkbox" className="mt-0.5" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                    <span>This person agreed to receive WhatsApp messages from us.</span>
                  </label>
                ) : null}
              </div>
            ) : (
              <textarea
                className={cn(inputCls, "min-h-16 resize-none")}
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {!liveEnabled ? "Sending is switched off until WhatsApp is activated." : `Last activity ${conversation.last_message_at ? fmtDateTime(conversation.last_message_at) : "-"}`}
              </p>
              <Button size="sm" onClick={submit} disabled={!canSubmit}>
                <Send className="h-3.5 w-3.5" /> {send.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
