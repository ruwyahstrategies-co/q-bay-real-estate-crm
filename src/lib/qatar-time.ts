/** Business calendar: Q-Bay operates on Qatar time, whatever timezone the browser is in. */
export const QATAR_TZ = "Asia/Qatar";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: QATAR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day in Qatar as YYYY-MM-DD, so it sorts and compares as a string. */
export function qatarDayKey(value: Date | string | number): string {
  return dayFormatter.format(new Date(value));
}

export function isQatarToday(value: Date | string | number, now: Date | number = Date.now()): boolean {
  return qatarDayKey(value) === qatarDayKey(now);
}

// Qatar has no daylight saving: it is UTC+3 all year. Date-time inputs on forms are read and written in
// Qatar time, so a viewing booked as "10:00" is 10:00 in Doha for everyone, whatever their browser says.
const QATAR_OFFSET = "+03:00";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: QATAR_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: QATAR_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: QATAR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "20 Oct 2026, 14:30" in Qatar time. */
export function fmtQatarDateTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  return dateTimeFormatter.format(new Date(value));
}

/** "14:30" in Qatar time. */
export function fmtQatarTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  return timeFormatter.format(new Date(value));
}

/** An instant as the value of a datetime-local input, in Qatar time ("2026-10-20T14:30"). */
export function toQatarInputValue(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(value)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The value of a datetime-local input (Qatar time) as an ISO instant, or null when empty or invalid. */
export function fromQatarInputValue(local: string | null | undefined): string | null {
  if (!local) return null;
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const d = new Date(`${withSeconds}${QATAR_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
