// Approved WhatsApp message templates. Meta only lets a business start a conversation, or write after the 24 hour
// window, with a template Meta has approved, so the CRM keeps a copy of the approved list and refuses any other.
//
// Actions (managers only):
//   sync            reads the template list from Meta for the connected Business Account and stores it.
//   upsert_manual   registers a template by hand (for testing the screens before Meta access exists). A manual
//                   template is still checked by Meta when a message is sent, so a wrong entry fails safely.
//
// Reading the list needs no function: signed-in staff read whatsapp_templates directly, subject to row level security.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveActiveCaller, isAdminTeamMember } from "../_shared/auth.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { safeMetaError, templateRowFromMeta } from "../_shared/whatsapp-core.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await checkRateLimit(req, "whatsapp-templates", 10))) return tooManyRequests(CORS);
  const auth = await resolveActiveCaller(req, service);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(isAdminTeamMember(auth.teamMember) || auth.teamMember.role === "super_administrator")) {
    return json({ error: "Only a manager can manage WhatsApp templates." }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.action === "upsert_manual") {
    const waba_id = String(body.waba_id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const language = String(body.language ?? "").trim();
    const body_text = String(body.body_text ?? "").trim();
    if (!waba_id || !/^[a-z0-9_]{1,512}$/.test(name) || !language) {
      return json({ error: "waba_id, a lowercase template name (letters, numbers, underscores) and a language are required." }, 400);
    }
    const status = ["approved", "pending", "rejected", "paused", "disabled"].includes(body.status) ? body.status : "approved";
    const row = templateRowFromMeta(waba_id, {
      name,
      language,
      status: status.toUpperCase(),
      category: body.category,
      components: [{ type: "BODY", text: body_text }],
    });
    const { data, error } = await service
      .from("whatsapp_templates")
      .upsert({ ...row, source: "manual", synced_at: null }, { onConflict: "waba_id,name,language" })
      .select("id, name, language, status, param_count")
      .single();
    if (error) return json({ error: "Could not save the template." }, 500);
    return json({ ok: true, template: data });
  }

  if (body.action !== "sync") return json({ error: "Unknown action" }, 400);

  const { data: conn } = await service
    .from("agent_whatsapp_connections")
    .select("waba_id, access_token_secret_id, scope, team_member_id")
    .or(`scope.eq.company,team_member_id.eq.${auth.teamMember.id}`)
    .order("scope", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!conn?.waba_id || !conn.access_token_secret_id) {
    return json({ error: "Connect a WhatsApp number with its Business Account ID first." }, 409);
  }
  const { data: token } = await service.rpc("vault_read_secret", { _id: conn.access_token_secret_id });
  if (!token) return json({ error: "Could not read the stored access token." }, 500);

  const graph = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v21.0";
  let url: string | null = `https://graph.facebook.com/${graph}/${conn.waba_id}/message_templates?limit=100&fields=name,language,status,category,components`;
  const rows: ReturnType<typeof templateRowFromMeta>[] = [];
  try {
    for (let page = 0; url && page < 10; page++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ ok: false, error: safeMetaError(data, res.status) }, 502);
      for (const t of data.data ?? []) rows.push(templateRowFromMeta(conn.waba_id, t));
      const next: string | undefined = data?.paging?.next;
      url = next && new URL(next).hostname === "graph.facebook.com" ? next : null;
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message).slice(0, 200) }, 502);
  }

  if (rows.length) {
    const { error } = await service.from("whatsapp_templates").upsert(rows, { onConflict: "waba_id,name,language" });
    if (error) return json({ error: "Could not store the templates." }, 500);
  }
  return json({ ok: true, synced: rows.length, approved: rows.filter((r) => r.status === "approved").length });
});
