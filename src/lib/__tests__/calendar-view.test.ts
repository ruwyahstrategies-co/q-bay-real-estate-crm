import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA_DAYS,
  addDays,
  addMonths,
  compareEntries,
  daysForView,
  daysInMonth,
  minutesOf,
  monthStart,
  rangeLabel,
  stepCursor,
  weekStart,
} from "../calendar-view";

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-22"), "2026-10-19"); // a Thursday
  assert.equal(weekStart("2026-10-19"), "2026-10-19"); // the Monday itself
  assert.equal(weekStart("2026-10-25"), "2026-10-19"); // the Sunday belongs to the week before
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
});

test("days roll over month and year ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("months keep the day, or fall back to the month's last day", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(monthStart("2026-10-22"), "2026-10-01");
  assert.equal(daysInMonth("2026-02-10"), 28);
  assert.equal(daysInMonth("2028-02-10"), 29);
});

test("each view steps by its own unit", () => {
  assert.equal(stepCursor("month", "2026-10-22", 1), "2026-11-01");
  assert.equal(stepCursor("month", "2026-10-22", -1), "2026-09-01");
  assert.equal(stepCursor("week", "2026-10-22", 1), "2026-10-29");
  assert.equal(stepCursor("day", "2026-10-22", -1), "2026-10-21");
  assert.equal(stepCursor("agenda", "2026-10-22", 1), addDays("2026-10-22", AGENDA_DAYS));
});

test("views lay out the right days", () => {
  assert.deepEqual(daysForView("day", "2026-10-22"), ["2026-10-22"]);
  const week = daysForView("week", "2026-10-22");
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-10-19");
  assert.equal(week[6], "2026-10-25");
  const agenda = daysForView("agenda", "2026-10-22");
  assert.equal(agenda.length, AGENDA_DAYS);
  assert.equal(agenda[0], "2026-10-22");
});

test("headings describe the window", () => {
  assert.equal(rangeLabel("month", "2026-10-22"), "October 2026");
  assert.match(rangeLabel("week", "2026-10-22"), /^19 Oct to 25 Oct 2026$/);
  assert.match(rangeLabel("day", "2026-10-22"), /Thursday.*22 October 2026/);
});

test("entries order all-day first, then by time, then by label", () => {
  const list = [
    { minutes: 600, label: "B viewing" },
    { minutes: null, label: "Contract expires" },
    { minutes: 540, label: "Z task" },
    { minutes: 600, label: "A viewing" },
  ];
  list.sort(compareEntries);
  assert.deepEqual(
    list.map((e) => e.label),
    ["Contract expires", "Z task", "A viewing", "B viewing"],
  );
  assert.equal(minutesOf("09:30"), 570);
  assert.equal(minutesOf("-"), null);
  assert.equal(minutesOf(null), null);
});
