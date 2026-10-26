// The request handlers for the WhatsApp webhook and the WhatsApp send. They hold every decision (what is allowed,
// in what order, what is answered) and reach the outside world only through the `deps` they are given, so the
// edge functions pass real Supabase and Meta clients and the tests pass fakes.
//
// Safe by default: until the server-side switch WHATSAPP_LIVE_ENABLED is on, nothing is sent and no inbound
// message is accepted; until META_APP_SECRET exists, every webhook delivery is refused.

import {
  MAX_TEXT_LENGTH,
  MAX_WEBHOOK_BYTES,
  buildMediaPayload,
  buildTemplatePayload,
  buildTextPayload,
  checkTemplateUse,
  normalizeRecipientPhone,
  parseWebhook,
  ruleErrorFrom,
  safeMetaError,
  timingSafeEqual,
  verifyMetaSignature,
  type InboundMessageEvent,
  type StatusEvent,
  type TemplateRow,
} from "./whatsapp-core.ts";

export type RpcResult = { data: any; error: { message: string } | null };

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

// ============================================================================ webhook

export type WebhookEventLog = {
  phone_number_id?: string | null;
  event_kind: string;
  wa_id?: string | null;
  wa_message_id?: string | null;
  outcome: "processed" | "duplicate" | "ignored" | "rejected" | "error";
  detail?: string | null;
  payload?: unknown;
};

export type WebhookDeps = {
  /** Meta app secret (server-side only). Without it every delivery is refused. */
  appSecret: string | null;
  /** The one verify token set in the Meta app's webhook settings. */
  verifyToken: string | null;
  /** The master switch for live messaging. */
  liveEnabled: boolean;
  /** Older per-connection verify tokens kept in the vault; checked only when no app-level token matches. */
  matchesStoredVerifyToken: (token: string) => Promise<boolean>;
  ingestInbound: (e: InboundMessageEvent) => Promise<RpcResult>;
  applyStatus: (e: StatusEvent) => Promise<RpcResult>;
  logEvent: (e: WebhookEventLog) => Promise<void>;
};

async function safeLog(deps: WebhookDeps, e: WebhookEventLog) {
  try {
    await deps.logEvent(e);
  } catch {
    // The event log must never be the reason a delivery fails.
  }
}

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token || !challenge) return new Response("Forbidden", { status: 403 });
    const ok =
      (deps.verifyToken != null && timingSafeEqual(token, deps.verifyToken)) ||
      (await deps.matchesStoredVerifyToken(token));
    return ok ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Fail closed: with no app secret there is no way to know a delivery really came from Meta.
  if (!deps.appSecret) return json({ ok: false, error: "webhook_not_configured" }, 503);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);

  // The signature covers the exact bytes Meta sent, so it is checked before anything is parsed.
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);

  const valid = await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), deps.appSecret);
  if (!valid) {
    await safeLog(deps, { event_kind: "delivery", outcome: "rejected", detail: "invalid_signature" });
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  // A signed delivery while switched off is answered with a retryable error so Meta sends it again later.
  if (!deps.liveEnabled) {
    await safeLog(deps, { event_kind: "delivery", outcome: "ignored", detail: "live_messaging_disabled" });
    return json({ ok: false, error: "live_messaging_disabled" }, 503);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    await safeLog(deps, { event_kind: "delivery", outcome: "rejected", detail: "invalid_json" });
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const events = parseWebhook(payload);
  let processed = 0;
  let duplicates = 0;
  let ignored = 0;
  let failed = 0;

  for (const e of events) {
    try {
      const res = e.kind === "message" ? await deps.ingestInbound(e) : await deps.applyStatus(e);
      if (res.error) throw new Error(res.error.message);
      const out = res.data ?? {};
      const base = {
        phone_number_id: e.phoneNumberId,
        event_kind: e.kind === "message" ? `message:${e.type}` : `status:${e.status}`,
        wa_id: e.kind === "message" ? e.waId : e.recipientId,
        wa_message_id: e.messageId,
      };
      if (out.ok === false) {
        ignored++;
        await safeLog(deps, { ...base, outcome: "ignored", detail: String(out.reason ?? "rejected_by_rules") });
      } else if (out.duplicate) {
        duplicates++;
        await safeLog(deps, { ...base, outcome: "duplicate" });
      } else if (e.kind === "status" && out.found === false) {
        ignored++;
        await safeLog(deps, { ...base, outcome: "ignored", detail: String(out.reason ?? "unknown_message") });
      } else {
        processed++;
        await safeLog(deps, { ...base, outcome: "processed" });
      }
    } catch (err) {
      failed++;
      await safeLog(deps, {
        phone_number_id: e.phoneNumberId,
        event_kind: e.kind,
        wa_message_id: e.messageId,
        outcome: "error",
        detail: String((err as Error)?.message ?? err).slice(0, 300),
        payload: e,
      });
    }
  }

  // Any failure is answered with a server error so Meta redelivers. That is safe: every write is idempotent.
  if (failed > 0) return json({ ok: false, error: "processing_failed", processed, duplicates, ignored, failed }, 500);
  return json({ ok: true, processed, duplicates, ignored });
}

// ============================================================================ send

export type WhatsappConnection = {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  connection_status: string;
  access_token_secret_id: string | null;
  scope: string;
};

export type WhatsappMode = "shared" | "individual" | "undecided";

export type SendCaller =
  | { ok: true; userId: string; teamMemberId: string }
  | { ok: false; status: number; error: string };

export type SendDeps = {
  liveEnabled: boolean;
  defaultCountryCode: string;
  graphVersion: string;
  fetch: typeof fetch;
  rateLimitOk: (req: Request) => Promise<boolean>;
  /** Resolves the signed-in, active staff member. */
  authenticate: (req: Request) => Promise<SendCaller>;
  /** Asks the database, AS THE CALLER, whether they may send to this lead (Conversations and Leads permissions). */
  canSendLead: (req: Request, leadId: string) => Promise<boolean>;
  getLead: (leadId: string) => Promise<{ id: string; phone: string | null } | null>;
  getMode: () => Promise<WhatsappMode>;
  getConnections: (teamMemberId: string) => Promise<{ own: WhatsappConnection | null; company: WhatsappConnection | null }>;
  getTemplate: (wabaId: string, name: string, language: string) => Promise<TemplateRow | null>;
  readToken: (secretId: string) => Promise<string | null>;
  beginOutbound: (a: {
    connectionId: string;
    leadId: string;
    waId: string;
    clientRequestId: string | null;
    type: string;
    body: string | null;
    templateName: string | null;
    templateLanguage: string | null;
    templateParams: string[] | null;
    sentBy: string;
    optInConfirmed: boolean;
  }) => Promise<RpcResult>;
  finishOutbound: (a: {
    messageId: string;
    waMessageId: string | null;
    errorCode: string | null;
    errorText: string | null;
    sentByUser: string;
  }) => Promise<RpcResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SendBody = {
  lead_id?: string;
  message?: string;
  template?: { name?: string; language?: string; params?: unknown };
  media?: { kind?: string; url?: string; caption?: string; filename?: string };
  client_request_id?: string;
  opt_in_confirmed?: boolean;
};

function err(status: number, code: string, message: string) {
  return json({ ok: false, code, error: message }, status);
}

/** Which of the caller's reachable connections the message goes out on, given the company's chosen model. */
export function pickConnection(
  mode: WhatsappMode,
  conns: { own: WhatsappConnection | null; company: WhatsappConnection | null },
): WhatsappConnection | null {
  if (mode === "shared") return conns.company;
  if (mode === "individual") return conns.own;
  return conns.own ?? conns.company;
}

export async function handleSend(req: Request, deps: SendDeps): Promise<Response> {
  if (req.method !== "POST") return err(405, "method_not_allowed", "Method not allowed");
  if (!(await deps.rateLimitOk(req))) return err(429, "rate_limited", "Too many requests. Please slow down and try again in a minute.");

  const caller = await deps.authenticate(req);
  if (!caller.ok) return err(caller.status, "unauthorized", caller.error);

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_json", "Invalid JSON body");
  }

  const leadId = body.lead_id;
  if (!leadId || !UUID.test(leadId)) return err(400, "lead_required", "lead_id is required. Messages are sent to a lead, never to a free-typed number.");

  const kinds = [body.message != null, body.template != null, body.media != null].filter(Boolean).length;
  if (kinds !== 1) return err(400, "one_content", "Send exactly one of message, template or media.");

  const clientRequestId = body.client_request_id ?? null;
  if (clientRequestId && !UUID.test(clientRequestId)) return err(400, "invalid_request_id", "client_request_id must be a UUID.");

  // Lead-level permission: asked of the database as the caller, so it is the same rule that guards the lead itself.
  if (!(await deps.canSendLead(req, leadId))) return err(403, "forbidden", "You do not have access to message this lead.");

  if (!deps.liveEnabled) {
    return err(503, "not_activated", "WhatsApp messaging is not activated yet. Nothing was sent.");
  }

  const lead = await deps.getLead(leadId);
  if (!lead) return err(404, "lead_not_found", "Lead not found.");
  const to = normalizeRecipientPhone(lead.phone, deps.defaultCountryCode);
  if (!to) return err(400, "invalid_recipient", "This lead has no valid phone number to send WhatsApp messages to.");

  const mode = await deps.getMode();
  const conn = pickConnection(mode, await deps.getConnections(caller.teamMemberId));
  if (!conn) {
    return err(
      409,
      "no_connection",
      mode === "shared"
        ? "The company WhatsApp number is not connected yet."
        : "You have no WhatsApp connection configured. Set one up in Settings first.",
    );
  }
  if (conn.connection_status !== "connected") return err(409, "not_verified", "This WhatsApp connection is not verified yet.");
  if (!conn.access_token_secret_id) return err(409, "no_token", "This WhatsApp connection has no access token stored.");

  let type: string;
  let text: string | null = null;
  let tplName: string | null = null;
  let tplLang: string | null = null;
  let tplParams: string[] | null = null;
  let payload: Record<string, unknown>;

  if (body.message != null) {
    text = String(body.message).trim();
    if (!text) return err(400, "empty_message", "Message cannot be empty.");
    if (text.length > MAX_TEXT_LENGTH) return err(400, "message_too_long", `Message cannot be longer than ${MAX_TEXT_LENGTH} characters.`);
    type = "text";
    payload = buildTextPayload(to, text);
  } else if (body.template != null) {
    tplName = String(body.template.name ?? "").trim();
    tplLang = String(body.template.language ?? "").trim();
    const params = Array.isArray(body.template.params) ? body.template.params.map((p) => String(p ?? "")) : [];
    if (!tplName || !tplLang) return err(400, "template_required", "Template name and language are required.");
    if (!conn.waba_id) return err(409, "no_waba", "This connection has no WhatsApp Business Account ID, so templates cannot be checked.");
    const tpl = await deps.getTemplate(conn.waba_id, tplName, tplLang);
    const check = checkTemplateUse(tpl, params);
    if (!check.ok) return err(422, check.code, check.message);
    type = "template";
    tplParams = params;
    payload = buildTemplatePayload(to, tplName, tplLang, params);
  } else {
    const kind = body.media?.kind;
    const url = body.media?.url ?? "";
    if (!kind || !["image", "document", "audio", "video"].includes(kind)) return err(400, "media_kind", "Media kind must be image, document, audio or video.");
    if (!/^https:\/\/[^\s]+$/i.test(url)) return err(400, "media_url", "Media must be sent from a secure https link.");
    type = kind;
    text = body.media?.caption?.trim() || null;
    payload = buildMediaPayload(to, kind as "image", url, text, body.media?.filename ?? null);
  }

  // Reserve the message first. The database enforces the 24 hour window, opt-out and consent, and a repeated
  // request id returns the first message instead of sending a second one.
  const begun = await deps.beginOutbound({
    connectionId: conn.id,
    leadId,
    waId: to,
    clientRequestId,
    type,
    body: text,
    templateName: tplName,
    templateLanguage: tplLang,
    templateParams: tplParams,
    sentBy: caller.teamMemberId,
    optInConfirmed: body.opt_in_confirmed === true,
  });
  if (begun.error) {
    const rule = ruleErrorFrom(begun.error.message);
    if (rule) return err(rule.status, rule.code, rule.message);
    return err(500, "reserve_failed", "Could not prepare the message.");
  }
  if (begun.data?.duplicate) {
    // The first attempt with this request id already failed. Say so; the sender retries with a fresh request id.
    if (begun.data.status === "failed") {
      return err(409, "previous_attempt_failed", "The earlier attempt to send this message failed. Send it again to retry.");
    }
    return json({ ok: true, duplicate: true, message_id: begun.data.message_id, status: begun.data.status, wa_message_id: begun.data.wa_message_id ?? null });
  }
  const messageId: string = begun.data.message_id;

  const token = await deps.readToken(conn.access_token_secret_id);
  if (!token) {
    await deps.finishOutbound({ messageId, waMessageId: null, errorCode: "token", errorText: "Could not read the stored access token.", sentByUser: caller.userId });
    return err(500, "token_unreadable", "Could not read the stored access token.");
  }

  try {
    const res = await deps.fetch(`https://graph.facebook.com/${deps.graphVersion}/${conn.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = safeMetaError(data, res.status);
      await deps.finishOutbound({
        messageId,
        waMessageId: null,
        errorCode: String(data?.error?.code ?? res.status),
        errorText: message,
        sentByUser: caller.userId,
      });
      return json({ ok: false, code: "meta_rejected", error: message, message_id: messageId, status: "failed" }, 502);
    }
    const waMessageId: string | null = data?.messages?.[0]?.id ?? null;
    if (!waMessageId) {
      await deps.finishOutbound({ messageId, waMessageId: null, errorCode: "no_id", errorText: "Meta accepted the request but returned no message id.", sentByUser: caller.userId });
      return json({ ok: false, code: "meta_no_id", error: "Meta returned no message id.", message_id: messageId, status: "failed" }, 502);
    }
    await deps.finishOutbound({ messageId, waMessageId, errorCode: null, errorText: null, sentByUser: caller.userId });
    return json({ ok: true, message_id: messageId, wa_message_id: waMessageId, status: "sent" });
  } catch (e) {
    const message = String((e as Error)?.message ?? "Send failed").slice(0, 300);
    await deps.finishOutbound({ messageId, waMessageId: null, errorCode: "network", errorText: message, sentByUser: caller.userId });
    return json({ ok: false, code: "network", error: message, message_id: messageId, status: "failed" }, 502);
  }
}
