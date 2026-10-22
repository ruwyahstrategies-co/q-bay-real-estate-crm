// Builds a lead's activity timeline from everything recorded about it, newest first. Every entry says who did
// it (when the database knows) and when. Pure, so the ordering and wording are tested.

import { outcomeLabel } from "./activity";

export type TimelineCategory =
  | "contact"
  | "stage"
  | "handover"
  | "task"
  | "note"
  | "file"
  | "viewing"
  | "offer"
  | "lead";

export type TimelineEvent = {
  id: string;
  at: string;
  category: TimelineCategory;
  title: string;
  detail?: string;
  /** Who did it, or null when it was recorded by the system. */
  actor: string | null;
  /** Ids of uploads that are evidence for this entry. */
  attachmentIds?: string[];
  /** The pipeline stage the lead was in when it happened, for contacts. */
  stage?: string | null;
};

type Id = string | null | undefined;

export type TimelineInput = {
  lead: { id: string; created_at: string; created_by: Id };
  /** Resolves a user id or a team member id to a name. */
  actorName: (id: Id) => string | null;
  stageLabel: (key: string) => string;
  history: {
    id: string;
    previous_stage: string | null;
    new_stage: string;
    changed_at: string;
    changed_by: Id;
    changed_by_member: Id;
    kind: string;
    reason: string | null;
  }[];
  interactions: {
    id: string;
    interaction_type: string;
    direction: string | null;
    subject: string | null;
    content: string | null;
    interaction_date: string;
    created_by: Id;
    actor_team_member_id: Id;
    lead_stage: string | null;
    outcome: string | null;
    duration_seconds: number | null;
  }[];
  attachmentsByInteraction: Map<string, string[]>;
  notes: { id: string; content: string; created_at: string; author_id: Id }[];
  tasks: {
    id: string;
    title: string;
    created_at: string;
    created_by: Id;
    completed_at: string | null;
  }[];
  files: {
    id: string;
    filename: string;
    created_at: string;
    uploaded_by: Id;
    interaction_id: Id;
  }[];
  assignments: { id: string; created_at: string; title: string; detail: string }[];
  viewings: {
    id: string;
    scheduled_at: string;
    created_at: string;
    status: string;
    created_by: Id;
    property_title: string | null;
  }[];
  offers: {
    id: string;
    created_at: string;
    amount: number | null;
    currency: string | null;
    status: string;
    created_by: Id;
  }[];
};

const TYPE_LABEL: Record<string, string> = {
  phone_call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  manual_note: "Note",
  website_enquiry: "Website enquiry",
  walk_in: "Walk-in",
};

function titleCaseWord(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function clip(text: string | null | undefined, max = 220): string | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t;
}

export function buildLeadTimeline(input: TimelineInput): TimelineEvent[] {
  const { actorName, stageLabel } = input;
  const events: TimelineEvent[] = [];

  events.push({
    id: `lead-${input.lead.id}`,
    at: input.lead.created_at,
    category: "lead",
    title: "Lead created",
    actor: actorName(input.lead.created_by),
  });

  for (const h of input.history) {
    // The creation row is the same fact as "Lead created".
    if (h.kind === "created") continue;
    const actor = actorName(h.changed_by_member) ?? actorName(h.changed_by);
    const from = h.previous_stage ? stageLabel(h.previous_stage) : null;
    const to = stageLabel(h.new_stage);
    let title = from ? `Stage: ${from} to ${to}` : `Stage: ${to}`;
    if (h.kind === "correction") title = `Stage corrected: ${from ?? "?"} back to ${to}`;
    else if (h.kind === "reassignment_reset") title = `Pipeline restarted at ${to}`;
    else if (h.kind === "closing") title = `Deal closed: ${to}`;
    events.push({
      id: `stage-${h.id}`,
      at: h.changed_at,
      category: "stage",
      title,
      detail: clip(h.reason),
      actor,
    });
  }

  for (const i of input.interactions) {
    const parts = [TYPE_LABEL[i.interaction_type] ?? titleCaseWord(i.interaction_type)];
    if (i.direction === "inbound") parts.push("inbound");
    else if (i.direction === "outbound") parts.push("outbound");
    const out = outcomeLabel(i.outcome);
    if (out) parts.push(out);
    const detail = [i.subject?.trim(), clip(i.content)].filter(Boolean).join(": ") || undefined;
    events.push({
      id: `interaction-${i.id}`,
      at: i.interaction_date,
      category: "contact",
      title: parts.join(" · "),
      detail:
        i.duration_seconds && i.duration_seconds > 0
          ? [detail, `${Math.max(1, Math.round(i.duration_seconds / 60))} min`]
              .filter(Boolean)
              .join(" · ")
          : detail,
      actor: actorName(i.actor_team_member_id) ?? actorName(i.created_by),
      attachmentIds: input.attachmentsByInteraction.get(i.id),
      stage: i.lead_stage ? stageLabel(i.lead_stage) : null,
    });
  }

  for (const n of input.notes) {
    events.push({
      id: `note-${n.id}`,
      at: n.created_at,
      category: "note",
      title: "Note added",
      detail: clip(n.content),
      actor: actorName(n.author_id),
    });
  }

  for (const t of input.tasks) {
    events.push({
      id: `task-${t.id}`,
      at: t.created_at,
      category: "task",
      title: `Task created: ${t.title}`,
      actor: actorName(t.created_by),
    });
    if (t.completed_at) {
      events.push({
        id: `task-done-${t.id}`,
        at: t.completed_at,
        category: "task",
        title: `Task completed: ${t.title}`,
        actor: null,
      });
    }
  }

  for (const f of input.files) {
    // Evidence attached to a conversation is shown on that conversation.
    if (f.interaction_id) continue;
    events.push({
      id: `file-${f.id}`,
      at: f.created_at,
      category: "file",
      title: `File uploaded: ${f.filename}`,
      actor: actorName(f.uploaded_by),
    });
  }

  for (const a of input.assignments) {
    events.push({
      id: `assign-${a.id}`,
      at: a.created_at,
      category: "handover",
      title: a.title,
      detail: a.detail,
      actor: null,
    });
  }

  for (const v of input.viewings) {
    events.push({
      id: `viewing-${v.id}`,
      at: v.created_at,
      category: "viewing",
      title: `Viewing ${titleCaseWord(v.status).toLowerCase()}${v.property_title ? `: ${v.property_title}` : ""}`,
      detail: `Scheduled for ${v.scheduled_at}`,
      actor: actorName(v.created_by),
    });
  }

  for (const o of input.offers) {
    events.push({
      id: `offer-${o.id}`,
      at: o.created_at,
      category: "offer",
      title: `Offer ${o.status}${o.amount != null ? `: ${o.currency ?? "QAR"} ${Number(o.amount).toLocaleString("en-US")}` : ""}`,
      actor: actorName(o.created_by),
    });
  }

  // Newest first; entries at the same instant keep a stable order.
  return events.sort((a, b) => {
    const d = new Date(b.at).getTime() - new Date(a.at).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

export const TIMELINE_FILTERS: { value: "all" | TimelineCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "contact", label: "Contacts" },
  { value: "stage", label: "Stage" },
  { value: "handover", label: "Handovers" },
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "file", label: "Files" },
];
