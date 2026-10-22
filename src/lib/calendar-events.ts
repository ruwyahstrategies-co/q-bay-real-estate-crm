// What the Calendar shows, and how a task is told apart as a Task, an Event or a Reminder.
//
// Tasks, viewings, owner contract expiries, tenancy expiries and rent due dates are all drawn from their own
// records. Nothing is copied into a separate calendar table, so the Calendar can never drift from the Tasks and
// Viewings pages: completing or moving an entry here changes the same row those pages read.

import type { Task } from "./db";

export type EventType = "viewing" | "task" | "event" | "reminder" | "contract" | "tenancy" | "rent";

export const EVENT_TYPES: EventType[] = [
  "viewing",
  "task",
  "event",
  "reminder",
  "contract",
  "tenancy",
  "rent",
];

export const EVENT_LABEL: Record<EventType, string> = {
  viewing: "Viewing",
  task: "Task",
  event: "Event",
  reminder: "Reminder",
  contract: "Owner Contract Expiry",
  tenancy: "Tenancy Expiry",
  rent: "Rent Due",
};

/** Solid edge/dot tone per type, so chips and the legend stay legible on white. */
export const EVENT_TONE: Record<EventType, string> = {
  viewing: "#6FA8DC",
  task: "#A58AD0",
  event: "#E08A5B",
  reminder: "#D6B24A",
  contract: "#B7A06A",
  tenancy: "#4FA374",
  rent: "#94A3B8",
};

export const EVENT_COLOR: Record<EventType, string> = {
  viewing: "bg-pastel-blue",
  task: "bg-pastel-purple",
  event: "bg-pastel-cream",
  reminder: "bg-pastel-cream",
  contract: "bg-pastel-cream",
  tenancy: "bg-pastel-green",
  rent: "bg-muted",
};

/** The three kinds of task a person can choose when they add one. Anything else a task carries is system-made. */
export type TaskCategory = "task" | "event" | "reminder";

export const TASK_CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: "task", label: "Task" },
  { value: "event", label: "Event" },
  { value: "reminder", label: "Reminder" },
];

/**
 * A task's category from its stored task_type. An empty type is a plain Task, "event" is an Event, and a
 * "reminder" (or the system-made availability check) is a Reminder.
 */
export function taskCategoryOf(taskType: string | null | undefined): TaskCategory {
  const t = (taskType ?? "").trim().toLowerCase();
  if (t === "event") return "event";
  if (t === "reminder" || t === "availability_confirmation") return "reminder";
  return "task";
}

export function isTaskDone(status: string | null | undefined): boolean {
  return status === "completed";
}

export function isTaskCancelled(status: string | null | undefined): boolean {
  return status === "cancelled";
}

/** What a task changes to when it is completed or reopened. */
export function completionPatch(
  done: boolean,
  nowIso: string,
): Pick<Task, "status" | "completed_at"> {
  return done
    ? { status: "completed", completed_at: nowIso }
    : { status: "pending", completed_at: null };
}

export type RelatedRecords = {
  leadId: string | null;
  leadName: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

export const NO_RELATED: RelatedRecords = {
  leadId: null,
  leadName: null,
  propertyId: null,
  propertyTitle: null,
  ownerId: null,
  ownerName: null,
};

/** Every calendar entry carries the id of the record behind it, so opening it never depends on its label. */
export type CalEvent = {
  key: string;
  date: string;
  /** Month cells show the time in front of the label. */
  label: string;
  /** The label without the time, for views that show the time in its own column. */
  shortLabel: string;
  /** "HH:mm" in Qatar time, or null for an all-day entry such as an expiry. */
  time: string | null;
  minutes: number | null;
  type: EventType;
  /** Finished: a completed task or viewing. */
  done: boolean;
  /** Cancelled viewing or task. */
  cancelled: boolean;
  /** Plain words for the status, for the preview. */
  statusLabel: string | null;
  assignedName: string | null;
  related: RelatedRecords;
} & (
  | {
      type: "viewing";
      viewingId: string;
      scheduledAt: string;
      viewingStatus: string;
      canReschedule: boolean;
    }
  | { type: "task" | "event" | "reminder"; task: Task }
  | {
      type: "contract";
      ownerId: string;
      ownerName: string;
      propertyTitle: string | null;
      propertyId: string | null;
      expiry: string;
    }
  | {
      type: "tenancy";
      leaseId: string;
      propertyId: string;
      tenant: string;
      propertyTitle: string | null;
      start: string | null;
      end: string;
      status: string;
    }
  | {
      type: "rent";
      leaseId: string;
      propertyId: string | null;
      propertyTitle: string | null;
      amount: number;
      currency: string;
      due: string;
      status: string;
    }
);
