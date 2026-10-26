import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composerMode,
  filterConversations,
  groupByDay,
  messageDisplayText,
  renderTemplateBody,
  statusLabel,
  windowState,
} from "../whatsapp-inbox";

const NOW = new Date("2026-10-26T12:00:00Z");

test("the window label says how long free replies stay open, or what to do instead", () => {
  const open = windowState("2026-10-26T01:30:00Z", NOW);
  assert.equal(open.open, true);
  assert.match(open.label, /13h 30m/);
  assert.equal(windowState("2026-10-26T11:59:30Z", NOW).open, true);
  const closed = windowState("2026-10-25T11:00:00Z", NOW);
  assert.equal(closed.open, false);
  assert.match(closed.label, /template/i);
  const never = windowState(null, NOW);
  assert.equal(never.open, false);
  assert.match(never.label, /template/i);
});

test("the composer offers text inside the window, templates outside it, and nothing after an opt-out", () => {
  assert.equal(composerMode({ last_inbound_at: "2026-10-26T10:00:00Z", opt_in_status: "opted_in" }, NOW), "text");
  assert.equal(composerMode({ last_inbound_at: "2026-10-24T10:00:00Z", opt_in_status: "opted_in" }, NOW), "template_only");
  assert.equal(composerMode({ last_inbound_at: null, opt_in_status: "unknown" }, NOW), "template_only");
  assert.equal(composerMode({ last_inbound_at: "2026-10-26T10:00:00Z", opt_in_status: "opted_out" }, NOW), "blocked");
  assert.equal(composerMode(null, NOW), "template_only");
});

test("delivery states read in plain words", () => {
  assert.equal(statusLabel("delivered"), "Delivered");
  assert.equal(statusLabel("read"), "Read");
  assert.equal(statusLabel("failed"), "Failed");
  assert.equal(statusLabel("odd"), "odd");
});

test("a template shows the text that was actually sent", () => {
  assert.equal(renderTemplateBody("Hi {{1}}, see you {{2}}.", ["Sara", "Friday"]), "Hi Sara, see you Friday.");
  assert.equal(renderTemplateBody(null, ["x"]), null);
  const base = { id: "1", direction: "outbound", wa_timestamp: null, created_at: "2026-10-26T10:00:00Z", body: null, template_params: ["Sara"] };
  assert.equal(
    messageDisplayText({ ...base, message_type: "template", template_name: "greet" }, { greet: "Hello {{1}}" }),
    "Hello Sara",
  );
  assert.equal(messageDisplayText({ ...base, message_type: "template", template_name: "unknown_tpl" }), "[template: unknown_tpl]");
  assert.equal(messageDisplayText({ ...base, message_type: "image", template_name: null }), "[image]");
  assert.equal(messageDisplayText({ ...base, message_type: "text", template_name: null, body: "Hello" }), "Hello");
});

test("a thread reads oldest first and splits at midnight Qatar time", () => {
  const msgs = [
    { id: "c", wa_timestamp: null, created_at: "2026-10-26T21:30:00Z" }, // 00:30 on the 27th in Qatar
    { id: "a", wa_timestamp: "2026-10-26T08:00:00Z", created_at: "2026-10-26T08:00:01Z" },
    { id: "b", wa_timestamp: "2026-10-26T20:30:00Z", created_at: "2026-10-26T20:30:01Z" },
  ];
  const groups = groupByDay(msgs);
  assert.deepEqual(groups.map((g) => g.day), ["2026-10-26", "2026-10-27"]);
  assert.deepEqual(groups[0].items.map((m) => m.id), ["a", "b"]);
  assert.deepEqual(groups[1].items.map((m) => m.id), ["c"]);
});

test("the conversation list is newest first and narrows by unread and search", () => {
  const list = [
    { id: 1, contact_name: "Sara", wa_id: "97455500001", unread_count: 0, last_message_preview: "Thanks", last_message_at: "2026-10-26T09:00:00Z" },
    { id: 2, contact_name: null, wa_id: "97455500002", unread_count: 2, last_message_preview: "Is the villa free?", last_message_at: "2026-10-26T11:00:00Z" },
    { id: 3, contact_name: "Omar", wa_id: "97455500003", unread_count: 1, last_message_preview: "Hello", last_message_at: "2026-10-25T11:00:00Z" },
  ];
  assert.deepEqual(filterConversations(list, { unreadOnly: false, search: "" }).map((c) => c.id), [2, 1, 3]);
  assert.deepEqual(filterConversations(list, { unreadOnly: true, search: "" }).map((c) => c.id), [2, 3]);
  assert.deepEqual(filterConversations(list, { unreadOnly: false, search: "sara" }).map((c) => c.id), [1]);
  assert.deepEqual(filterConversations(list, { unreadOnly: false, search: "villa" }).map((c) => c.id), [2]);
  assert.deepEqual(filterConversations(list, { unreadOnly: false, search: "00003" }).map((c) => c.id), [3]);
  assert.deepEqual(
    filterConversations(list, { unreadOnly: false, search: "dubai buyer" }, (c) => (c.id === 1 ? "Dubai Buyer" : null)).map((c) => c.id),
    [1],
    "the lead's name is searchable too",
  );
});
