// Date maths for the Calendar's Month, Week, Day and Agenda views.
//
// Everything works on plain "YYYY-MM-DD" day keys (the same keys the calendar already groups events by) and
// uses UTC arithmetic on them, so a browser's own time zone and daylight saving can never shift a day.

export type CalendarView = "month" | "week" | "day" | "agenda";

export const CALENDAR_VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

/** How many days the Agenda looks ahead from its start day. */
export const AGENDA_DAYS = 30;

const toUtc = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function addDays(key: string, n: number): string {
  const d = toUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

/** Adds whole months, keeping the day of month where it exists and otherwise using the month's last day. */
export function addMonths(key: string, n: number): string {
  const d = toUtc(key);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toKey(d);
}

/** The Monday of the week a day falls in. */
export function weekStart(key: string): string {
  const offset = (toUtc(key).getUTCDay() + 6) % 7;
  return addDays(key, -offset);
}

export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function daysInMonth(key: string): number {
  const d = toUtc(key);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Moves the calendar one step: a month, a week, a day, or a whole agenda window. */
export function stepCursor(view: CalendarView, key: string, direction: 1 | -1): string {
  switch (view) {
    case "month":
      return addMonths(monthStart(key), direction);
    case "week":
      return addDays(key, 7 * direction);
    case "day":
      return addDays(key, direction);
    case "agenda":
      return addDays(key, AGENDA_DAYS * direction);
  }
}

/** The days a non-month view lays out. */
export function daysForView(view: Exclude<CalendarView, "month">, key: string): string[] {
  if (view === "day") return [key];
  if (view === "week") {
    const start = weekStart(key);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  return Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(key, i));
}

const longDay = (key: string) =>
  toUtc(key).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const shortDay = (key: string) =>
  toUtc(key).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The heading for the current window, for example "October 2026" or "19 Oct to 25 Oct 2026". */
export function rangeLabel(view: CalendarView, key: string): string {
  if (view === "month") {
    return toUtc(key).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (view === "day") return longDay(key);
  const days = daysForView(view, key);
  return `${shortDay(days[0])} to ${shortDay(days[days.length - 1])} ${days[days.length - 1].slice(0, 4)}`;
}

/** "Monday 19 October" style heading for one day column or group. */
export function dayHeading(key: string): string {
  return toUtc(key).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Minutes after midnight for an "HH:mm" time, or null for an all-day entry. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** All-day entries first, then timed entries by time, then by label so the order never jumps around. */
export function compareEntries(
  a: { minutes: number | null; label: string },
  b: { minutes: number | null; label: string },
): number {
  if (a.minutes == null && b.minutes != null) return -1;
  if (a.minutes != null && b.minutes == null) return 1;
  if (a.minutes != null && b.minutes != null && a.minutes !== b.minutes)
    return a.minutes - b.minutes;
  return a.label.localeCompare(b.label);
}
