import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplatePayload,
  checkTemplateUse,
  hmacSha256Hex,
  isWindowOpen,
  normalizeRecipientPhone,
  parseWebhook,
  ruleErrorFrom,
  safeMetaError,
  templateParamCount,
  templateRowFromMeta,
  verifyMetaSignature,
  windowClosesAt,
} from "../../../supabase/functions/_shared/whatsapp-core.ts";
import {
  handleSend,
  handleWebhook,
  pickConnection,
  type RpcResult,
  type SendDeps,
  type WebhookDeps,
  type WebhookEventLog,
  type WhatsappConnection,
} from "../../../supabase/functions/_shared/whatsapp-handlers.ts";

const SECRET = "test-app-secret-not-real";

async function signed(body: string, secret = SECRET) {
  return `sha256=${await hmacSha256Hex(secret, body)}`;
}

// ---------------------------------------------------------------- signature

test("a signature is valid only for the exact body and secret it was made with", async () => {
  const body = JSON.stringify({ hello: "world" });
  const sig = await signed(body);
  assert.equal(await verifyMetaSignature(body, sig, SECRET), true);
  assert.equal(await verifyMetaSignature(body, sig.toUpperCase().replace("SHA256=", "sha256="), SECRET), true);
  assert.equal(await verifyMetaSignature(body + " ", sig, SECRET), false, "a changed body fails");
  assert.equal(await verifyMetaSignature(body, await signed(body, "other-secret"), SECRET), false, "a different secret fails");
  assert.equal(await verifyMetaSignature(body, null, SECRET), false, "no header fails");
  assert.equal(await verifyMetaSignature(body, "sha1=" + sig.slice(7), SECRET), false, "wrong prefix fails");
  assert.equal(await verifyMetaSignature(body, "sha256=abc", SECRET), false, "wrong length fails");
  assert.equal(await verifyMetaSignature(body, sig, ""), false, "an empty secret never verifies");
});

// ---------------------------------------------------------------- payload parsing

const inboundPayload = (over: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PN1", display_phone_number: "97440000000" },
            contacts: [{ wa_id: "97455500001", profile: { name: "Sara" } }],
            messages: [
              { id: "wamid.A", from: "97455500001", timestamp: "1790000000", type: "text", text: { body: "Hello there" }, ...over },
            ],
          },
        },
      ],
    },
  ],
});

test("a text message is read with its sender, name, time and body", () => {
  const [e] = parseWebhook(inboundPayload());
  assert.equal(e.kind, "message");
  if (e.kind !== "message") return;
  assert.equal(e.phoneNumberId, "PN1");
  assert.equal(e.waId, "97455500001");
  assert.equal(e.contactName, "Sara");
  assert.equal(e.messageId, "wamid.A");
  assert.equal(e.body, "Hello there");
  assert.equal(e.timestamp, new Date(1790000000 * 1000).toISOString());
});

test("media, buttons, locations and reactions become readable events", () => {
  const img = parseWebhook(
    inboundPayload({ type: "image", text: undefined, image: { id: "MID1", mime_type: "image/jpeg", sha256: "abc", caption: "the villa" } }),
  )[0];
  assert.ok(img.kind === "message");
  if (img.kind === "message") {
    assert.equal(img.media.length, 1);
    assert.equal(img.media[0].media_id, "MID1");
    assert.equal(img.media[0].kind, "image");
    assert.equal(img.body, "the villa");
  }
  const doc = parseWebhook(inboundPayload({ type: "document", text: undefined, document: { id: "D1", mime_type: "application/pdf", filename: "id.pdf" } }))[0];
  assert.ok(doc.kind === "message" && doc.media[0].filename === "id.pdf");
  const btn = parseWebhook(inboundPayload({ type: "button", text: undefined, button: { text: "Yes please" } }))[0];
  assert.ok(btn.kind === "message" && btn.body === "Yes please");
  const loc = parseWebhook(inboundPayload({ type: "location", text: undefined, location: { latitude: 25.3, longitude: 51.5, name: "The Pearl" } }))[0];
  assert.ok(loc.kind === "message" && loc.body === "Location: The Pearl");
  const reaction = parseWebhook(inboundPayload({ type: "reaction", text: undefined, reaction: { emoji: "👍", message_id: "wamid.X" } }))[0];
  assert.ok(reaction.kind === "message" && reaction.body === "👍");
});

test("delivery and read statuses are read, including a failure reason", () => {
  const events = parseWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "PN1" },
              statuses: [
                { id: "wamid.O1", status: "delivered", timestamp: "1790000100", recipient_id: "97455500001" },
                { id: "wamid.O2", status: "failed", timestamp: "1790000200", recipient_id: "97455500001", errors: [{ code: 131047, title: "Re-engagement message", message: "More than 24 hours have passed" }] },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(events.length, 2);
  assert.ok(events[0].kind === "status" && events[0].status === "delivered");
  assert.ok(events[1].kind === "status" && events[1].errorCode === "131047" && /24 hours/.test(events[1].errorText ?? ""));
});

test("anything that is not a WhatsApp message event is skipped", () => {
  assert.deepEqual(parseWebhook(null), []);
  assert.deepEqual(parseWebhook({ object: "page", entry: [] }), []);
  assert.deepEqual(parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update", value: {} }] }] }), []);
  assert.deepEqual(parseWebhook(inboundPayload({ id: undefined })), []);
  assert.deepEqual(parseWebhook(inboundPayload({ from: undefined })), []);
});

// ---------------------------------------------------------------- phone numbers

test("recipient numbers come out as digits with a country code, or not at all", () => {
  assert.equal(normalizeRecipientPhone("+974 5550 0001"), "97455500001");
  assert.equal(normalizeRecipientPhone("00974 5550 0001"), "97455500001");
  assert.equal(normalizeRecipientPhone("5550 0001"), "97455500001", "a local number gets the default country code");
  assert.equal(normalizeRecipientPhone("+44 7700 900123"), "447700900123");
  assert.equal(normalizeRecipientPhone("12"), null);
  assert.equal(normalizeRecipientPhone(""), null);
  assert.equal(normalizeRecipientPhone(null), null);
  assert.equal(normalizeRecipientPhone("1234567890123456789"), null);
});

// ---------------------------------------------------------------- messaging window

test("free replies are allowed for 24 hours after the customer's last message", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.equal(isWindowOpen("2026-10-26T11:59:00Z", now), true);
  assert.equal(isWindowOpen("2026-10-25T12:00:01Z", now), true);
  assert.equal(isWindowOpen("2026-10-25T12:00:00Z", now), false, "exactly 24 hours is closed");
  assert.equal(isWindowOpen("2026-10-24T12:00:00Z", now), false);
  assert.equal(isWindowOpen(null, now), false, "no inbound message means no window");
  assert.equal(isWindowOpen("not a date", now), false);
  assert.equal(windowClosesAt("2026-10-26T10:00:00Z")?.toISOString(), "2026-10-27T10:00:00.000Z");
  assert.equal(windowClosesAt(null), null);
});

// ---------------------------------------------------------------- templates

const approved = { name: "viewing_reminder", language: "en", status: "approved", param_count: 2 };

test("a template is sent only if approved and given exactly the values it expects", () => {
  assert.deepEqual(checkTemplateUse(approved, ["Sara", "Friday 4pm"]), { ok: true });
  const missing = checkTemplateUse(null, []);
  assert.ok(!missing.ok && missing.code === "template_not_found");
  const pending = checkTemplateUse({ ...approved, status: "pending" }, ["a", "b"]);
  assert.ok(!pending.ok && pending.code === "template_not_approved");
  const rejected = checkTemplateUse({ ...approved, status: "rejected" }, ["a", "b"]);
  assert.ok(!rejected.ok && rejected.code === "template_not_approved");
  const few = checkTemplateUse(approved, ["only one"]);
  assert.ok(!few.ok && few.code === "template_params");
  const empty = checkTemplateUse(approved, ["Sara", "  "]);
  assert.ok(!empty.ok && empty.code === "template_params");
});

test("a template's value count and body are read from Meta's components", () => {
  const components = [
    { type: "HEADER", format: "TEXT", text: "Hello" },
    { type: "BODY", text: "Hi {{1}}, your viewing is on {{2}} at {{3}}." },
  ];
  assert.equal(templateParamCount(components), 3);
  assert.equal(templateParamCount([{ type: "BODY", text: "No values here." }]), 0);
  assert.equal(templateParamCount(undefined), 0);
  const row = templateRowFromMeta("WABA1", { name: "viewing", language: "en", status: "APPROVED", category: "UTILITY", components });
  assert.equal(row.status, "approved");
  assert.equal(row.category, "utility");
  assert.equal(row.param_count, 3);
  assert.equal(templateRowFromMeta("WABA1", { name: "x", language: "en", status: "IN_APPEAL", components: [] }).status, "pending");
  assert.equal(templateRowFromMeta("WABA1", { name: "x", language: "en", status: "SOMETHING_NEW", components: [] }).status, "unknown");
});

test("the template request carries positional values only when there are some", () => {
  const withValues = buildTemplatePayload("97455500001", "viewing", "en", ["Sara", "Friday"]) as any;
  assert.equal(withValues.template.components[0].parameters.length, 2);
  assert.equal(withValues.template.language.code, "en");
  const none = buildTemplatePayload("97455500001", "hello_world", "en_US", []) as any;
  assert.equal(none.template.components, undefined);
});

test("database rule errors become clear messages, and tokens never leak from Meta errors", () => {
  assert.equal(ruleErrorFrom("window_closed")?.status, 409);
  assert.equal(ruleErrorFrom("ERROR: recipient_opted_out")?.code, "recipient_opted_out");
  assert.equal(ruleErrorFrom("opt_in_required")?.code, "opt_in_required");
  assert.equal(ruleErrorFrom("some other failure"), null);
  const msg = safeMetaError({ error: { message: "Invalid OAuth access token EAAGm0PX4ZCpsBAKexampletokenvalue1234" } }, 401);
  assert.ok(!msg.includes("EAAGm0PX4ZCpsBAK"));
});

// ---------------------------------------------------------------- webhook handler

function webhookDeps(over: Partial<WebhookDeps> = {}) {
  const calls = { ingest: [] as any[], status: [] as any[], logs: [] as WebhookEventLog[] };
  const deps: WebhookDeps = {
    appSecret: SECRET,
    verifyToken: "verify-me",
    liveEnabled: true,
    matchesStoredVerifyToken: async () => false,
    ingestInbound: async (e) => {
      calls.ingest.push(e);
      return { data: { ok: true, duplicate: false }, error: null };
    },
    applyStatus: async (e) => {
      calls.status.push(e);
      return { data: { ok: true, found: true, updated: true }, error: null };
    },
    logEvent: async (e) => {
      calls.logs.push(e);
    },
    ...over,
  };
  return { deps, calls };
}

async function post(deps: WebhookDeps, body: string, headers: Record<string, string> = {}) {
  const res = await handleWebhook(
    new Request("https://x.test/whatsapp-webhook", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }),
    deps,
  );
  return { res, json: await res.json().catch(() => null) };
}

test("webhook handshake accepts only the right verify token", async () => {
  const { deps } = webhookDeps();
  const ok = await handleWebhook(new Request("https://x.test/w?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"), deps);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");
  const bad = await handleWebhook(new Request("https://x.test/w?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345"), deps);
  assert.equal(bad.status, 403);
  const noMode = await handleWebhook(new Request("https://x.test/w?hub.verify_token=verify-me&hub.challenge=1"), deps);
  assert.equal(noMode.status, 403);
  const legacy = webhookDeps({ matchesStoredVerifyToken: async (t) => t === "vault-token" }).deps;
  assert.equal((await handleWebhook(new Request("https://x.test/w?hub.mode=subscribe&hub.verify_token=vault-token&hub.challenge=9"), legacy)).status, 200);
});

test("with no app secret configured, every delivery is refused and nothing is processed", async () => {
  const { deps, calls } = webhookDeps({ appSecret: null });
  const body = JSON.stringify(inboundPayload());
  const { res } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 503);
  assert.equal(calls.ingest.length, 0);
});

test("an unsigned or wrongly signed delivery is rejected before anything is read or written", async () => {
  const { deps, calls } = webhookDeps();
  const body = JSON.stringify(inboundPayload());
  const none = await post(deps, body);
  assert.equal(none.res.status, 401);
  const wrong = await post(deps, body, { "x-hub-signature-256": await signed(body, "someone-elses-secret") });
  assert.equal(wrong.res.status, 401);
  const tampered = await post(deps, body.replace("Hello", "Hacked"), { "x-hub-signature-256": await signed(body) });
  assert.equal(tampered.res.status, 401);
  assert.equal(calls.ingest.length + calls.status.length, 0);
  assert.ok(calls.logs.every((l) => l.outcome === "rejected" && l.payload === undefined), "rejected deliveries are logged without their content");
});

test("a signed delivery while live messaging is off is answered with a retryable error and not processed", async () => {
  const { deps, calls } = webhookDeps({ liveEnabled: false });
  const body = JSON.stringify(inboundPayload());
  const { res } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 503);
  assert.equal(calls.ingest.length, 0);
});

test("a signed inbound message and a signed status are each processed once", async () => {
  const { deps, calls } = webhookDeps();
  const body = JSON.stringify(inboundPayload());
  const { res, json } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 200);
  assert.equal(json.processed, 1);
  assert.equal(calls.ingest.length, 1);
  assert.equal(calls.ingest[0].messageId, "wamid.A");

  const statusBody = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id: "wamid.O1", status: "read", timestamp: "1790000300", recipient_id: "97455500001" }] } }] }],
  });
  const s = await post(deps, statusBody, { "x-hub-signature-256": await signed(statusBody) });
  assert.equal(s.res.status, 200);
  assert.equal(calls.status.length, 1);
  assert.equal(calls.status[0].status, "read");
});

test("a redelivered message is reported as a duplicate, not processed twice, and still acknowledged", async () => {
  const { deps } = webhookDeps({ ingestInbound: async () => ({ data: { ok: true, duplicate: true }, error: null }) });
  const body = JSON.stringify(inboundPayload());
  const { res, json } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 200);
  assert.equal(json.duplicates, 1);
  assert.equal(json.processed, 0);
});

test("a message for a number we do not own is ignored without an error", async () => {
  const { deps } = webhookDeps({ ingestInbound: async () => ({ data: { ok: false, reason: "unknown_number" }, error: null }) });
  const body = JSON.stringify(inboundPayload());
  const { res, json } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 200);
  assert.equal(json.ignored, 1);
});

test("a database failure is answered with a server error so Meta redelivers, and the failure is logged", async () => {
  const { deps, calls } = webhookDeps({ ingestInbound: async () => ({ data: null, error: { message: "connection reset" } }) });
  const body = JSON.stringify(inboundPayload());
  const { res } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 500);
  assert.ok(calls.logs.some((l) => l.outcome === "error" && /connection reset/.test(l.detail ?? "")));
});

test("a failing event log never breaks a delivery", async () => {
  const { deps } = webhookDeps({
    logEvent: async () => {
      throw new Error("log table down");
    },
  });
  const body = JSON.stringify(inboundPayload());
  const { res } = await post(deps, body, { "x-hub-signature-256": await signed(body) });
  assert.equal(res.status, 200);
});

test("only POST and GET are accepted, and oversized bodies are refused", async () => {
  const { deps } = webhookDeps();
  assert.equal((await handleWebhook(new Request("https://x.test/w", { method: "PUT", body: "{}" }), deps)).status, 405);
  const big = "x".repeat(1_000_001);
  const { res } = await post(deps, big, { "x-hub-signature-256": await signed(big) });
  assert.equal(res.status, 413);
});

// ---------------------------------------------------------------- send handler

const LEAD = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";
const OWN: WhatsappConnection = { id: "c-own", phone_number_id: "PN-OWN", waba_id: "WABA1", connection_status: "connected", access_token_secret_id: "s-own", scope: "agent" };
const COMPANY: WhatsappConnection = { id: "c-co", phone_number_id: "PN-CO", waba_id: "WABA1", connection_status: "connected", access_token_secret_id: "s-co", scope: "company" };

function sendDeps(over: Partial<SendDeps> = {}) {
  const calls = { fetch: [] as { url: string; init: any }[], begin: [] as any[], finish: [] as any[], canSend: [] as string[] };
  const deps: SendDeps = {
    liveEnabled: true,
    defaultCountryCode: "974",
    graphVersion: "v21.0",
    fetch: (async (url: any, init: any) => {
      calls.fetch.push({ url: String(url), init });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.NEW" }] }), { status: 200 });
    }) as typeof fetch,
    rateLimitOk: async () => true,
    authenticate: async () => ({ ok: true, userId: "u1", teamMemberId: "tm1" }),
    canSendLead: async (_r, leadId) => {
      calls.canSend.push(leadId);
      return true;
    },
    getLead: async (id) => ({ id, phone: "+974 5550 0001" }),
    getMode: async () => "individual",
    getConnections: async () => ({ own: OWN, company: COMPANY }),
    getTemplate: async () => ({ name: "viewing_reminder", language: "en", status: "approved", param_count: 1 }),
    readToken: async () => "SERVER_SIDE_TOKEN",
    beginOutbound: async (a): Promise<RpcResult> => {
      calls.begin.push(a);
      return { data: { ok: true, duplicate: false, message_id: "m1" }, error: null };
    },
    finishOutbound: async (a): Promise<RpcResult> => {
      calls.finish.push(a);
      return { data: { ok: true }, error: null };
    },
    ...over,
  };
  return { deps, calls };
}

async function send(deps: SendDeps, body: unknown) {
  const res = await handleSend(new Request("https://x.test/whatsapp-send", { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer jwt" } }), deps);
  return { res, json: await res.json() };
}

test("a text message goes to the number on the lead, through the right connection, and is recorded", async () => {
  const { deps, calls } = sendDeps();
  const { res, json } = await send(deps, { lead_id: LEAD, message: "Hello Sara", client_request_id: REQ, to: "99999999999" });
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.wa_message_id, "wamid.NEW");
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "https://graph.facebook.com/v21.0/PN-OWN/messages");
  const sent = JSON.parse(calls.fetch[0].init.body);
  assert.equal(sent.to, "97455500001", "the number comes from the lead, never from the request");
  assert.equal(sent.text.body, "Hello Sara");
  assert.equal(calls.fetch[0].init.headers.Authorization, "Bearer SERVER_SIDE_TOKEN");
  assert.equal(calls.begin[0].waId, "97455500001");
  assert.equal(calls.begin[0].clientRequestId, REQ);
  assert.equal(calls.finish[0].waMessageId, "wamid.NEW");
  assert.ok(!JSON.stringify(json).includes("SERVER_SIDE_TOKEN"), "the token is never returned");
});

test("sending requires a signed-in active staff member", async () => {
  const { deps, calls } = sendDeps({ authenticate: async () => ({ ok: false, status: 401, error: "Invalid session" }) });
  const { res } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 401);
  assert.equal(calls.fetch.length, 0);
});

test("a person who may not access the lead cannot send to it, and nothing is reserved or sent", async () => {
  const { deps, calls } = sendDeps({ canSendLead: async () => false });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 403);
  assert.equal(json.code, "forbidden");
  assert.equal(calls.begin.length, 0);
  assert.equal(calls.fetch.length, 0);
});

test("while live messaging is off, nothing is sent even for an allowed person", async () => {
  const { deps, calls } = sendDeps({ liveEnabled: false });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 503);
  assert.equal(json.code, "not_activated");
  assert.equal(calls.begin.length + calls.fetch.length, 0);
});

test("a request must name a lead and exactly one kind of content", async () => {
  const { deps } = sendDeps();
  assert.equal((await send(deps, { message: "hi" })).res.status, 400);
  assert.equal((await send(deps, { lead_id: "not-a-uuid", message: "hi" })).res.status, 400);
  assert.equal((await send(deps, { lead_id: LEAD })).res.status, 400);
  assert.equal((await send(deps, { lead_id: LEAD, message: "hi", template: { name: "a", language: "en" } })).res.status, 400);
  assert.equal((await send(deps, { lead_id: LEAD, message: "   " })).res.status, 400);
  assert.equal((await send(deps, { lead_id: LEAD, message: "x".repeat(4097) })).res.status, 400);
  assert.equal((await send(deps, { lead_id: LEAD, message: "hi", client_request_id: "nope" })).res.status, 400);
});

test("a lead with no usable phone number cannot be messaged", async () => {
  const { deps, calls } = sendDeps({ getLead: async (id) => ({ id, phone: "12" }) });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 400);
  assert.equal(json.code, "invalid_recipient");
  assert.equal(calls.fetch.length, 0);
});

test("the company's chosen model decides which number is used", async () => {
  assert.equal(pickConnection("shared", { own: OWN, company: COMPANY })?.id, "c-co");
  assert.equal(pickConnection("shared", { own: OWN, company: null }), null, "shared mode never falls back to a personal number");
  assert.equal(pickConnection("individual", { own: OWN, company: COMPANY })?.id, "c-own");
  assert.equal(pickConnection("individual", { own: null, company: COMPANY }), null, "individual mode never falls back to the company number");
  assert.equal(pickConnection("undecided", { own: null, company: COMPANY })?.id, "c-co");
  assert.equal(pickConnection("undecided", { own: OWN, company: COMPANY })?.id, "c-own");

  const shared = sendDeps({ getMode: async () => "shared" });
  await send(shared.deps, { lead_id: LEAD, message: "hi" });
  assert.match(shared.calls.fetch[0].url, /PN-CO\/messages$/);
});

test("an unverified connection or one without a token cannot send", async () => {
  const a = sendDeps({ getConnections: async () => ({ own: { ...OWN, connection_status: "unverified" }, company: null }) });
  const r1 = await send(a.deps, { lead_id: LEAD, message: "hi" });
  assert.equal(r1.res.status, 409);
  assert.equal(r1.json.code, "not_verified");
  const b = sendDeps({ getConnections: async () => ({ own: null, company: null }) });
  assert.equal((await send(b.deps, { lead_id: LEAD, message: "hi" })).json.code, "no_connection");
  assert.equal(a.calls.fetch.length + b.calls.fetch.length, 0);
});

test("outside the 24 hour window free text is refused by the rules, and Meta is never called", async () => {
  const { deps, calls } = sendDeps({ beginOutbound: async () => ({ data: null, error: { message: "window_closed" } }) });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 409);
  assert.equal(json.code, "window_closed");
  assert.equal(calls.fetch.length, 0);
});

test("a person who opted out is never messaged", async () => {
  const { deps, calls } = sendDeps({ beginOutbound: async () => ({ data: null, error: { message: "recipient_opted_out" } }) });
  const { res, json } = await send(deps, { lead_id: LEAD, template: { name: "viewing_reminder", language: "en", params: ["x"] } });
  assert.equal(res.status, 409);
  assert.equal(json.code, "recipient_opted_out");
  assert.equal(calls.fetch.length, 0);
});

test("an approved template is sent with its values; an unapproved or mismatched one is refused before anything is reserved", async () => {
  const ok = sendDeps();
  const r = await send(ok.deps, { lead_id: LEAD, template: { name: "viewing_reminder", language: "en", params: ["Friday 4pm"] }, opt_in_confirmed: true });
  assert.equal(r.res.status, 200);
  const sent = JSON.parse(ok.calls.fetch[0].init.body);
  assert.equal(sent.type, "template");
  assert.equal(sent.template.components[0].parameters[0].text, "Friday 4pm");
  assert.equal(ok.calls.begin[0].optInConfirmed, true);
  assert.equal(ok.calls.begin[0].type, "template");

  const pending = sendDeps({ getTemplate: async () => ({ name: "viewing_reminder", language: "en", status: "pending", param_count: 1 }) });
  const p = await send(pending.deps, { lead_id: LEAD, template: { name: "viewing_reminder", language: "en", params: ["x"] } });
  assert.equal(p.res.status, 422);
  assert.equal(p.json.code, "template_not_approved");

  const wrong = sendDeps();
  const w = await send(wrong.deps, { lead_id: LEAD, template: { name: "viewing_reminder", language: "en", params: [] } });
  assert.equal(w.json.code, "template_params");

  const unknown = sendDeps({ getTemplate: async () => null });
  assert.equal((await send(unknown.deps, { lead_id: LEAD, template: { name: "nope", language: "en", params: [] } })).json.code, "template_not_found");
  assert.equal(pending.calls.begin.length + wrong.calls.begin.length + unknown.calls.begin.length, 0);
});

test("pressing send twice with the same request id sends once", async () => {
  const { deps, calls } = sendDeps({
    beginOutbound: async () => ({ data: { ok: true, duplicate: true, message_id: "m1", status: "sent", wa_message_id: "wamid.FIRST" }, error: null }),
  });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi", client_request_id: REQ });
  assert.equal(res.status, 200);
  assert.equal(json.duplicate, true);
  assert.equal(json.wa_message_id, "wamid.FIRST");
  assert.equal(calls.fetch.length, 0);
});

test("when Meta refuses, the message is recorded as failed with a clear reason and no token", async () => {
  const { deps, calls } = sendDeps({
    fetch: (async () =>
      new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message. Token EAAGm0PX4ZCpsBAKleakedtoken12345" } }), { status: 400 })) as typeof fetch,
  });
  const { res, json } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 502);
  assert.equal(json.status, "failed");
  assert.equal(calls.finish[0].waMessageId, null);
  assert.equal(calls.finish[0].errorCode, "131047");
  assert.ok(!JSON.stringify(json).includes("EAAGm0PX4ZCpsBAK"));
  assert.ok(!JSON.stringify(calls.finish).includes("EAAGm0PX4ZCpsBAK"));
});

test("a network failure is recorded as failed, not left as sending", async () => {
  const { deps, calls } = sendDeps({
    fetch: (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch,
  });
  const { res } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 502);
  assert.equal(calls.finish.length, 1);
  assert.equal(calls.finish[0].waMessageId, null);
});

test("media must come from a secure link and only inside the window", async () => {
  const { deps } = sendDeps();
  assert.equal((await send(deps, { lead_id: LEAD, media: { kind: "image", url: "http://insecure.test/a.jpg" } })).json.code, "media_url");
  assert.equal((await send(deps, { lead_id: LEAD, media: { kind: "exe", url: "https://ok.test/a" } })).json.code, "media_kind");
  const ok = sendDeps();
  const r = await send(ok.deps, { lead_id: LEAD, media: { kind: "document", url: "https://files.test/brochure.pdf", caption: "Brochure", filename: "brochure.pdf" } });
  assert.equal(r.res.status, 200);
  const sent = JSON.parse(ok.calls.fetch[0].init.body);
  assert.equal(sent.type, "document");
  assert.equal(sent.document.link, "https://files.test/brochure.pdf");
  assert.equal(ok.calls.begin[0].type, "document");
});

test("rate limiting is enforced before anything else", async () => {
  const { deps, calls } = sendDeps({ rateLimitOk: async () => false });
  const { res } = await send(deps, { lead_id: LEAD, message: "hi" });
  assert.equal(res.status, 429);
  assert.equal(calls.canSend.length, 0);
});
