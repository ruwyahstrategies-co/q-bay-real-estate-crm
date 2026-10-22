import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_LABEL,
  EVENT_TYPES,
  completionPatch,
  isTaskCancelled,
  isTaskDone,
  taskCategoryOf,
} from "../calendar-events";

test("a task is a Task, an Event or a Reminder from its stored type", () => {
  assert.equal(taskCategoryOf(null), "task");
  assert.equal(taskCategoryOf(""), "task");
  assert.equal(taskCategoryOf("task"), "task");
  assert.equal(taskCategoryOf("event"), "event");
  assert.equal(taskCategoryOf(" Event "), "event");
  assert.equal(taskCategoryOf("reminder"), "reminder");
  // The availability check the system creates is a reminder, not a task someone has to plan.
  assert.equal(taskCategoryOf("availability_confirmation"), "reminder");
  // Unknown older values stay plain tasks, so nothing disappears from the calendar.
  assert.equal(taskCategoryOf("follow_up_call"), "task");
});

test("completing and reopening set the same fields the Tasks page uses", () => {
  const now = "2026-10-22T10:00:00.000Z";
  assert.deepEqual(completionPatch(true, now), { status: "completed", completed_at: now });
  assert.deepEqual(completionPatch(false, now), { status: "pending", completed_at: null });
  assert.equal(isTaskDone("completed"), true);
  assert.equal(isTaskDone("pending"), false);
  assert.equal(isTaskCancelled("cancelled"), true);
  assert.equal(isTaskCancelled("in_progress"), false);
});

test("every entry type has a label for the legend and filters", () => {
  for (const t of EVENT_TYPES) assert.ok(EVENT_LABEL[t], `no label for ${t}`);
  for (const t of ["viewing", "task", "event", "reminder"] as const) assert.ok(EVENT_TYPES.includes(t));
});
