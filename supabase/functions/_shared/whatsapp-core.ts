// WhatsApp Business (Meta Cloud API) rules that do not depend on Deno, Supabase or the network, so the same code
// runs in the edge functions and in the unit tests. Nothing here talks to Meta or the database.
//
// What lives here:
//   * Webhook signature verification (X-Hub-Signature-256, HMAC SHA-256 with the Meta app secret).
//   * Reading Meta's webhook payload into plain events (messages and statuses).
//   * Phone number normalisation for sending (the number always comes from the lead, never from the browser).
//   * Meta's messaging window and approved template rules.
//   * Turning database and Meta errors into clear, honest messages.

export const WINDOW_HOURS = 24;
export const MAX_WEBHOOK_BYTES = 1_000_000;
export const MAX_TEXT_LENGTH = 4096;

// ------------------------------------------------------------------ signature

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that does not depend on where they first differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/**
 * True only when `header` is "sha256=" plus the HMAC SHA-256 of the exact raw request body under the app secret.
 * A missing header, a wrong prefix, a wrong length or a wrong value all fail.
 */
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!appSecret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqual(expected, m[1].toLowerCase());
}

// ------------------------------------------------------------------ payload

export type InboundMedia = {
  kind: "image" | "document" | "audio" | "video" | "sticker";
  media_id: string;
  mime_type: string | null;
  sha256: string | null;
  filename: string | null;
  caption: string | null;
};

export type InboundMessageEvent = {
  kind: "message";
  phoneNumberId: string;
  waId: string;
  contactName: string | null;
  messageId: string;
  type: string;
  body: string | null;
  timestamp: string | null;
  media: InboundMedia[];
  replyTo: string | null;
};

export type StatusEvent = {
  kind: "status";
  phoneNumberId: string;
  messageId: string;
  status: string;
  timestamp: string | null;
  recipientId: string | null;
  errorCode: string | null;
  errorText: string | null;
};

export type WebhookEvent = InboundMessageEvent | StatusEvent;

const MEDIA_KINDS = ["image", "document", "audio", "video", "sticker"] as const;

function isoFromEpoch(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** The readable text of a message, whichever way the customer sent it. */
export function messageBody(msg: any): string | null {
  switch (msg?.type) {
    case "text":
      return str(msg.text?.body);
    case "button":
      return str(msg.button?.text);
    case "interactive":
      return str(msg.interactive?.button_reply?.title) ?? str(msg.interactive?.list_reply?.title);
    case "reaction":
      return str(msg.reaction?.emoji);
    case "location": {
      const l = msg.location ?? {};
      const where = [str(l.name), str(l.address)].filter(Boolean).join(", ");
      const coords = l.latitude != null && l.longitude != null ? `${l.latitude}, ${l.longitude}` : "";
      return ["Location", where || coords].filter(Boolean).join(": ");
    }
    case "contacts":
      return "[contact shared]";
    default:
      if (MEDIA_KINDS.includes(msg?.type)) return str(msg[msg.type]?.caption);
      return null;
  }
}

/** Reads Meta's webhook body into plain events. Anything it does not recognise is skipped, never guessed at. */
export function parseWebhook(payload: any): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  if (payload?.object !== "whatsapp_business_account") return out;
  for (const entry of payload.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = str(value?.metadata?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      for (const msg of value.messages ?? []) {
        const messageId = str(msg?.id);
        const waId = str(msg?.from);
        if (!messageId || !waId) continue;
        const type = str(msg.type) ?? "unsupported";
        const media: InboundMedia[] = [];
        if (MEDIA_KINDS.includes(type as any)) {
          const m = msg[type] ?? {};
          const id = str(m.id);
          if (id) {
            media.push({
              kind: type as InboundMedia["kind"],
              media_id: id,
              mime_type: str(m.mime_type),
              sha256: str(m.sha256),
              filename: str(m.filename),
              caption: str(m.caption),
            });
          }
        }
        out.push({
          kind: "message",
          phoneNumberId,
          waId,
          contactName: str(value.contacts?.find((c: any) => c?.wa_id === waId)?.profile?.name),
          messageId,
          type,
          body: messageBody(msg),
          timestamp: isoFromEpoch(msg.timestamp),
          media,
          replyTo: str(msg.context?.id),
        });
      }

      for (const st of value.statuses ?? []) {
        const messageId = str(st?.id);
        const status = str(st?.status);
        if (!messageId || !status) continue;
        const err = Array.isArray(st.errors) ? st.errors[0] : null;
        out.push({
          kind: "status",
          phoneNumberId,
          messageId,
          status,
          timestamp: isoFromEpoch(st.timestamp),
          recipientId: str(st.recipient_id),
          errorCode: err?.code != null ? String(err.code) : null,
          errorText: str(err?.message) ?? str(err?.title),
        });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ phone numbers

/**
 * The digits Meta expects (country code, no plus) for a lead's stored number, or null when it cannot be a real
 * number. A local number with no country code gets the default country code.
 */
export function normalizeRecipientPhone(raw: string | null | undefined, defaultCountryCode = "974"): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  if (digits.length >= 6 && digits.length <= 9 && defaultCountryCode) digits = defaultCountryCode + digits;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// ------------------------------------------------------------------ messaging rules

/** Meta's customer service window: free-form replies only within 24 hours of the customer's last message. */
export function isWindowOpen(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < WINDOW_HOURS * 3600 * 1000;
}

export function windowClosesAt(lastInboundAt: string | Date | null | undefined): Date | null {
  if (!lastInboundAt) return null;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) ? new Date(t + WINDOW_HOURS * 3600 * 1000) : null;
}

export type TemplateRow = {
  name: string;
  language: string;
  status: string;
  param_count: number;
  category?: string | null;
};

export type TemplateCheck = { ok: true } | { ok: false; code: "template_not_found" | "template_not_approved" | "template_params"; message: string };

/** A template may be sent only if it is on file, approved by Meta, and given exactly the values its body expects. */
export function checkTemplateUse(template: TemplateRow | null | undefined, params: string[]): TemplateCheck {
  if (!template) {
    return { ok: false, code: "template_not_found", message: "That template is not on file. Sync templates from Meta first." };
  }
  if (template.status !== "approved") {
    return { ok: false, code: "template_not_approved", message: `Template "${template.name}" is ${template.status}, not approved by Meta.` };
  }
  if (params.length !== template.param_count) {
    return {
      ok: false,
      code: "template_params",
      message: `Template "${template.name}" needs ${template.param_count} value${template.param_count === 1 ? "" : "s"}, got ${params.length}.`,
    };
  }
  if (params.some((p) => !p.trim() || /[\n\t]{4,}/.test(p) || p.length > 1024)) {
    return { ok: false, code: "template_params", message: "Template values cannot be empty, contain long runs of line breaks, or exceed 1024 characters." };
  }
  return { ok: true };
}

/** How many {{n}} placeholders a template's body uses (Meta numbers them 1..n). */
export function templateParamCount(components: any): number {
  const body = Array.isArray(components) ? components.find((c: any) => String(c?.type).toUpperCase() === "BODY") : null;
  const text: string = typeof body?.text === "string" ? body.text : "";
  const nums = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function templateBodyText(components: any): string | null {
  const body = Array.isArray(components) ? components.find((c: any) => String(c?.type).toUpperCase() === "BODY") : null;
  return typeof body?.text === "string" ? body.text : null;
}

const TEMPLATE_STATUS: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "pending",
  IN_APPEAL: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
};

/** One entry of Meta's message_templates list, as a row for our table. */
export function templateRowFromMeta(wabaId: string, t: any) {
  const components = Array.isArray(t?.components) ? t.components : [];
  return {
    waba_id: wabaId,
    name: String(t?.name ?? ""),
    language: String(t?.language ?? ""),
    category: typeof t?.category === "string" ? t.category.toLowerCase() : null,
    status: TEMPLATE_STATUS[String(t?.status ?? "").toUpperCase()] ?? "unknown",
    components,
    body_text: templateBodyText(components),
    param_count: templateParamCount(components),
    source: "meta" as const,
    synced_at: new Date().toISOString(),
  };
}

/** Meta's send request for a template. Values are positional {{1}}, {{2}} ... in the body. */
export function buildTemplatePayload(to: string, name: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(params.length ? { components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] } : {}),
    },
  };
}

export function buildTextPayload(to: string, body: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } };
}

export function buildMediaPayload(to: string, kind: "image" | "document" | "audio" | "video", link: string, caption?: string | null, filename?: string | null) {
  const media: Record<string, unknown> = { link };
  if (caption && (kind === "image" || kind === "document" || kind === "video")) media.caption = caption;
  if (filename && kind === "document") media.filename = filename;
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: kind, [kind]: media };
}

// ------------------------------------------------------------------ error messages

export type RuleError = { status: number; code: string; message: string };

const RULE_ERRORS: Record<string, RuleError> = {
  window_closed: {
    status: 409,
    code: "window_closed",
    message: "The 24 hour customer service window is closed. Send an approved template to start the conversation again.",
  },
  recipient_opted_out: {
    status: 409,
    code: "recipient_opted_out",
    message: "This person opted out of WhatsApp messages. Do not message them on WhatsApp.",
  },
  opt_in_required: {
    status: 409,
    code: "opt_in_required",
    message: "There is no record that this person agreed to WhatsApp messages. Confirm their consent to send a template.",
  },
  conversation_belongs_to_other_lead: {
    status: 409,
    code: "conversation_belongs_to_other_lead",
    message: "This number already has a WhatsApp conversation under a different lead.",
  },
  invalid_recipient: { status: 400, code: "invalid_recipient", message: "The lead's phone number is not a valid WhatsApp number." },
};

/** Maps a database exception message from the WhatsApp functions to a clear rule error, or null if it is not one. */
export function ruleErrorFrom(message: string | null | undefined): RuleError | null {
  const key = Object.keys(RULE_ERRORS).find((k) => (message ?? "").includes(k));
  return key ? RULE_ERRORS[key] : null;
}

/** Meta's own error text, trimmed, without echoing anything that looks like a token. */
export function safeMetaError(data: any, status: number): string {
  const raw = String(data?.error?.message ?? `Meta API error ${status}`);
  return raw.replace(/(EAA[A-Za-z0-9]{10,})/g, "[token]").slice(0, 300);
}
