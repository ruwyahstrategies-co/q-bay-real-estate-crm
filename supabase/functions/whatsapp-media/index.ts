// Opens a picture, document or voice note a customer sent on WhatsApp. Meta keeps received media for a limited
// time and only hands it over with the connection's access token, so the CRM fetches it on demand, on the
// server, and passes the bytes to the signed-in person. The token never reaches the browser.
//
// Access: the media row is read AS THE CALLER, so row level security (lead access plus Conversations permission)
// decides whether they may see it. If they may not, it simply is not found.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, callerScopedClient } from "../_shared/auth.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { safeMetaError } from "../_shared/whatsapp-core.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BYTES = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Only types a browser can show safely inline. Anything else downloads instead of running.
function inlineType(mime: string | null): string | null {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  return /^(image\/(jpeg|png|webp|gif)|video\/(mp4|3gpp)|audio\/(ogg|mpeg|mp4|aac|amr)|application\/pdf)$/.test(m) ? m : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await checkRateLimit(req, "whatsapp-media", 60))) return tooManyRequests(CORS);
  const auth = await resolveActiveCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (Deno.env.get("WHATSAPP_LIVE_ENABLED") !== "true") return json({ error: "WhatsApp is not activated yet." }, 503);

  let body: { media_row_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.media_row_id || !UUID.test(body.media_row_id)) return json({ error: "media_row_id is required" }, 400);

  const caller = callerScopedClient(req);
  const { data: media } = await caller
    .from("whatsapp_message_media")
    .select("id, media_id, mime_type, filename, message_id")
    .eq("id", body.media_row_id)
    .maybeSingle();
  if (!media?.media_id) return json({ error: "Not found" }, 404);

  const { data: msg } = await service.from("whatsapp_messages").select("connection_id").eq("id", media.message_id).maybeSingle();
  const { data: conn } = msg
    ? await service.from("agent_whatsapp_connections").select("access_token_secret_id").eq("id", msg.connection_id).maybeSingle()
    : { data: null };
  if (!conn?.access_token_secret_id) return json({ error: "The connection that received this file is no longer available." }, 409);
  const { data: token } = await service.rpc("vault_read_secret", { _id: conn.access_token_secret_id });
  if (!token) return json({ error: "Could not read the stored access token." }, 500);

  const graph = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v21.0";
  try {
    const meta = await fetch(`https://graph.facebook.com/${graph}/${media.media_id}`, { headers: { Authorization: `Bearer ${token}` } });
    const info = await meta.json().catch(() => ({}));
    if (!meta.ok || !info?.url) {
      const expired = meta.status === 404 || meta.status === 400;
      await service.from("whatsapp_message_media").update({ download_status: expired ? "expired" : "failed", download_error: safeMetaError(info, meta.status) }).eq("id", media.id);
      return json({ error: expired ? "This file is no longer available from WhatsApp." : "WhatsApp could not provide this file." }, 502);
    }
    if (Number(info.file_size) > MAX_BYTES) return json({ error: "This file is too large to open here." }, 413);
    if (new URL(info.url).protocol !== "https:") return json({ error: "Unexpected media address." }, 502);

    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!file.ok) {
      await service.from("whatsapp_message_media").update({ download_status: "failed", download_error: `HTTP ${file.status}` }).eq("id", media.id);
      return json({ error: "WhatsApp could not provide this file." }, 502);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return json({ error: "This file is too large to open here." }, 413);

    const mime = info.mime_type ?? media.mime_type ?? null;
    const safe = inlineType(mime);
    const name = (media.filename ?? "whatsapp-file").replace(/[^\w.\- ]+/g, "_").slice(0, 100);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": safe ?? "application/octet-stream",
        "Content-Disposition": `${safe ? "inline" : "attachment"}; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return json({ error: String((e as Error).message).slice(0, 200) }, 502);
  }
});
