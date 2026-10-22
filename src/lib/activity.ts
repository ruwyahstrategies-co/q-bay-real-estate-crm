// Quick Activity: the kinds of contact an agent records against a lead, their possible outcomes, and a few
// small helpers. Every recorded contact is its own interaction row, even several in the same pipeline stage.

export type QuickKind = "call" | "whatsapp" | "email" | "meeting" | "note";

export type QuickKindConfig = {
  kind: QuickKind;
  label: string;
  /** The value stored in interactions.interaction_type. */
  interactionType: string;
  /** Whether the contact has a direction (who reached out). A note and a meeting do not. */
  hasDirection: boolean;
  outcomes: { value: string; label: string }[];
};

export const QUICK_KINDS: QuickKindConfig[] = [
  {
    kind: "call",
    label: "Call",
    interactionType: "phone_call",
    hasDirection: true,
    outcomes: [
      { value: "answered", label: "Answered" },
      { value: "no_answer", label: "No answer" },
      { value: "busy", label: "Busy" },
      { value: "voicemail", label: "Left voicemail" },
      { value: "wrong_number", label: "Wrong number" },
    ],
  },
  {
    kind: "whatsapp",
    label: "WhatsApp",
    interactionType: "whatsapp",
    hasDirection: true,
    outcomes: [
      { value: "sent", label: "Message sent" },
      { value: "replied", label: "Replied" },
      { value: "read_no_reply", label: "Read, no reply" },
      { value: "not_on_whatsapp", label: "Not on WhatsApp" },
    ],
  },
  {
    kind: "email",
    label: "Email",
    interactionType: "email",
    hasDirection: true,
    outcomes: [
      { value: "sent", label: "Sent" },
      { value: "replied", label: "Replied" },
      { value: "bounced", label: "Bounced" },
    ],
  },
  {
    kind: "meeting",
    label: "Meeting",
    interactionType: "meeting",
    hasDirection: false,
    outcomes: [
      { value: "held", label: "Held" },
      { value: "rescheduled", label: "Rescheduled" },
      { value: "no_show", label: "Client did not show" },
    ],
  },
  {
    kind: "note",
    label: "Note",
    interactionType: "manual_note",
    hasDirection: false,
    outcomes: [],
  },
];

export function quickKindConfig(kind: QuickKind): QuickKindConfig {
  return QUICK_KINDS.find((k) => k.kind === kind) ?? QUICK_KINDS[0];
}

/** Human label for a stored outcome value, for display in the timeline. */
export function outcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  for (const k of QUICK_KINDS) {
    const hit = k.outcomes.find((o) => o.value === outcome);
    if (hit) return hit.label;
  }
  return outcome.replace(/_/g, " ");
}

export const FOLLOW_UP_CHOICES: { value: string; label: string; days: number | null }[] = [
  { value: "none", label: "No follow-up", days: null },
  { value: "1", label: "Tomorrow", days: 1 },
  { value: "3", label: "In 3 days", days: 3 },
  { value: "7", label: "In a week", days: 7 },
];

/** A follow-up due at 10:00 Qatar time, the given number of days from now. Qatar has no daylight saving (UTC+3). */
export function followUpDueAt(days: number, nowMs: number): string {
  const qatarNow = new Date(nowMs + 3 * 3600_000);
  const day = new Date(
    Date.UTC(
      qatarNow.getUTCFullYear(),
      qatarNow.getUTCMonth(),
      qatarNow.getUTCDate() + days,
      10,
      0,
      0,
    ),
  );
  return new Date(day.getTime() - 3 * 3600_000).toISOString();
}

export const MAX_ATTACHMENTS = 10;

export const ATTACHMENT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf", "docx", "txt"];
export const ATTACHMENT_MAX_MB = 50;

/** Why a file cannot be attached as evidence, or null when it is fine. */
export function attachmentProblem(name: string, sizeBytes: number): string | null {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
    return `${name}: ".${ext || "?"}" is not supported. Use ${ATTACHMENT_EXTENSIONS.join(", ")}.`;
  }
  if (sizeBytes > ATTACHMENT_MAX_MB * 1024 * 1024)
    return `${name}: larger than ${ATTACHMENT_MAX_MB} MB.`;
  if (sizeBytes <= 0) return `${name}: the file is empty.`;
  return null;
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(name);
}
