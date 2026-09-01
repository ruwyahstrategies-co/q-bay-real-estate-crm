// Resolves a shortened Google Maps share link (maps.app.goo.gl / goo.gl/maps)
// to its final URL, server-side, by following the redirect chain. No Google
// Maps API key is used or required — this is a plain HTTP redirect follow.
// The client then regex-parses coordinates out of the resolved URL.
//
// Locked to Google's own short-link hosts to avoid this becoming an
// open server-side-request-forgery relay for arbitrary URLs.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = { id: string; user_id: string | null; is_active: boolean | null; role: string | null; permissions: Record<string, string[]> | null };
type ResolvedCaller = { ok: true; userId: string; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

async function resolveActiveCaller(req: Request, serviceClient: SupabaseClient): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };
  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members").select("id, user_id, is_active, role, permissions").eq("user_id", userData.user.id).maybeSingle();
  if (memberErr) return { ok: false, status: 500, error: "Failed to resolve staff record" };
  if (!teamMember) return { ok: false, status: 403, error: "Account not provisioned." };
  if (teamMember.is_active === false) return { ok: false, status: 403, error: "Account is inactive." };
  return { ok: true, userId: userData.user.id, teamMember: teamMember as TeamMemberRow };
}

function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const ALLOWED_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const caller = await resolveActiveCaller(req, supabase);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  if (!hasPermission(caller.teamMember, "properties", "edit") && !hasPermission(caller.teamMember, "developments", "edit")) {
    return json({ error: "Missing permission: properties.edit or developments.edit" }, 403);
  }

  let body: { url?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const rawUrl = (body?.url ?? "").trim();
  if (!rawUrl) return json({ error: "url is required" }, 400);

  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return json({ error: "Not a valid URL" }, 400); }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return json({ error: "Only Google Maps links can be resolved here." }, 400);
  }

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 QBayCRM-MapsLinkResolver/1.0" },
    });
    // Deno's fetch follows redirects transparently and exposes the final URL.
    return json({ ok: true, resolved_url: res.url || parsed.toString() });
  } catch (e) {
    return json({ error: `Could not resolve link: ${(e as Error).message}` }, 502);
  }
});
