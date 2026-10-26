# WhatsApp Business API: setup and go-live

The CRM is prepared for the WhatsApp Business Platform (Meta Cloud API). Nothing is live. No message is sent or
received until every step below is done and an administrator switches it on.

## What is built

| Area | What it does |
| --- | --- |
| Webhook (`whatsapp-webhook`) | Accepts a delivery only if Meta's `X-Hub-Signature-256` matches the HMAC of the exact body under the Meta app secret. Refuses everything while the secret is missing or live messaging is off. |
| Duplicates | A message is unique per connection and Meta message id (advisory lock plus unique index). Meta redelivering a message is harmless. A send is unique per `client_request_id`. |
| Statuses | `sent`, `delivered`, `read`, `failed` only move forward. A late or repeated webhook never rewinds one. |
| Permissions | Reading and sending follow the lead: Conversations permission scope plus Leads access, checked in the database as the signed-in person. A conversation with no lead is for a Super Administrator only. The recipient's number is read from the lead on the server, never sent from the browser. |
| Meta's rules | Free text only inside the 24 hour customer service window. Otherwise an approved template. Never to someone who sent STOP. A first template needs the sender to confirm consent. Enforced in the database, not only on screen. |
| Templates | `whatsapp_templates` holds the approved list. Sync from Meta (Settings, My WhatsApp Connection) or enter by hand to prepare. Only approved templates with the right number of values can be sent. |
| Media | Inbound picture, document, audio and video metadata is stored. Files are fetched from Meta on demand through `whatsapp-media` so no token reaches the browser. Outbound media goes by secure link. |
| Inbox | `/whatsapp`: conversations linked to leads, unread counts, delivery ticks, window timer, template picker. The lead page links to it. |
| Number model | `whatsapp_mode` is `shared` (one company number), `individual` (each agent's own) or `undecided`. A manager picks it in Settings and it can be changed later without a rebuild. |
| Event log | `whatsapp_webhook_events` records every delivery outcome (processed, duplicate, ignored, rejected, error) for reconciliation. Super Administrator only. |

## Secrets (Supabase, Project Settings, Edge Functions, Secrets)

Never commit these, paste them in chat, or put them in the browser. Credentials that were ever pasted into a chat
should be treated as exposed and replaced in Meta.

| Secret | Purpose |
| --- | --- |
| `META_APP_SECRET` | The Meta app's App Secret. Used only to verify webhook signatures. |
| `WHATSAPP_VERIFY_TOKEN` | A long random string you choose. Entered in Meta as the webhook verify token. |
| `WHATSAPP_LIVE_ENABLED` | Set to `true` only at go-live. Anything else keeps messaging off. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | Optional. Defaults to `974`. Applied to local numbers with no country code. |
| `WHATSAPP_GRAPH_VERSION` | Optional. Defaults to `v21.0`. |

Each number's access token is saved through Settings and stored encrypted in Supabase Vault. It is never shown again.

## What the client still has to provide from Meta

1. A Meta Business account that is verified, with a WhatsApp Business Account (WABA).
2. A Meta app with the WhatsApp product, and its **App Secret**.
3. A phone number added to the WABA and its **Phone Number ID**. Decide: one shared company number, or one per agent.
4. A **permanent access token** from a System User with `whatsapp_business_messaging` and
   `whatsapp_business_management` permissions (a temporary token expires within hours).
5. At least one **approved message template** (utility or marketing) for starting conversations.
6. The business display name approved, and the number's messaging limit tier understood.

## Go-live checklist

1. Deploy the edge functions: `whatsapp-webhook`, `whatsapp-send`, `whatsapp-connection`, `whatsapp-templates`,
   `whatsapp-media` (all with JWT verification off; each authenticates inside).
2. Set `META_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`.
3. In Meta, set the webhook callback URL (shown in Settings) and the verify token, and subscribe to the `messages` field.
4. In Settings, choose the number model, then connect the number (Phone Number ID, WABA ID, access token) and press
   Verify connection.
5. Sync templates from Meta.
6. Send one test message to a staff phone with `WHATSAPP_LIVE_ENABLED` still off (it must refuse), then set it to `true`
   and repeat.
7. Send a message from the test phone to the number and confirm it appears in the inbox and on the lead.

## Needs live Meta verification (cannot be proven without credentials)

- Meta accepting the webhook handshake and the signature on real deliveries.
- The exact fields of real inbound payloads for each message type (the parser follows Meta's documented shapes).
- Real delivery and read receipts arriving and updating ticks.
- Template sync output, template approval states and category rules.
- Sending a template, free text inside the window, and Meta's own rejection messages.
- Opening inbound media through `whatsapp-media` (Meta's media URLs, size and expiry).
- Sending media by link (Meta fetches the link, so it must be publicly reachable over https).
- Messaging limits and quality rating behaviour.

## Known limits

- A status that arrives before our own record of a just-sent message is logged as ignored (`unknown_message`). The
  later `delivered` and `read` statuses still apply.
- One connection per staff member. A manager who connects the company number cannot also hold a personal one.
- When two leads share one phone number, the conversation belongs to the first; the second lead cannot message it.
- A conversation whose lead was deleted can be re-linked by a manager through the `whatsapp_link_conversation`
  database function (no screen for it yet).
- Outbound media is recorded as a message with its caption; the link itself is not stored.
