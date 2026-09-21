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
