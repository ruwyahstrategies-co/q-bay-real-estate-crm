// Helpers for handing a lead to another agent: the two modes, and the acceptance deadline.
//
// The deadline is entered as an amount and a unit (minutes, hours or days) and sent to the database as
// whole minutes. The database turns it into one absolute deadline, enforces it, and expires the request.

export type ReassignMode = "start_over" | "continue";

export const REASSIGN_MODES: { value: ReassignMode; title: string; description: string }[] = [
  {
    value: "start_over",
    title: "Start All Over",
    description:
      "The pipeline stage is reset for the new agent. Everything the previous agent did stays on the lead as history.",
  },
  {
    value: "continue",
    title: "Continue From Previous Agent",
    description: "The lead keeps its current pipeline stage and all of its progress.",
  },
];

export type DeadlineUnit = "minutes" | "hours" | "days";

export const DEADLINE_UNITS: { value: DeadlineUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const UNIT_MINUTES: Record<DeadlineUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** The longest acceptance window the database allows: 30 days. */
export const MAX_DEADLINE_MINUTES = 30 * 1440;

export const DEFAULT_DEADLINE = { amount: "24", unit: "hours" as DeadlineUnit };

export type DeadlineResult =
  | { minutes: number; error?: undefined }
  | { minutes?: undefined; error: string };

/** Turns what was typed into whole minutes, or says what is wrong with it. */
export function parseDeadline(amountText: string, unit: DeadlineUnit): DeadlineResult {
  const text = amountText.trim();
  if (!text) return { error: "Enter how long the agent has to respond." };
  if (!/^\d+$/.test(text)) return { error: "Use a whole number, for example 24." };
  const minutes = Number(text) * UNIT_MINUTES[unit];
  if (!Number.isSafeInteger(minutes) || minutes < 1)
    return { error: "The deadline must be at least 1 minute." };
  if (minutes > MAX_DEADLINE_MINUTES) return { error: "The deadline can be at most 30 days." };
  return { minutes };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "30 minutes", "2 hours", "1 day", "1 day 12 hours". */
export function formatMinutes(total: number): string {
  if (total < 60) return plural(total, "minute");
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts = [];
  if (days) parts.push(plural(days, "day"));
  if (hours) parts.push(plural(hours, "hour"));
  if (minutes && !days) parts.push(plural(minutes, "minute"));
  return parts.join(" ");
}

/** How long is left until a deadline, for example "2 hours 5 minutes left", or "Expired". */
export function timeLeftLabel(deadlineIso: string, nowMs: number): string {
  const ms = new Date(deadlineIso).getTime() - nowMs;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "Expired";
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `${formatMinutes(minutes)} left`;
}

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for an answer",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};
