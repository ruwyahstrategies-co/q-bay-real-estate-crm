// Issues a Cloudflare Stream "direct creator upload" URL for the CRM's
// Property video uploader. The browser never sees the Cloudflare Account ID
// or Stream API Token - both stay server-side as Edge Function secrets. The
// browser then POSTs the video file straight to the one-time uploadURL this
// returns, and Cloudflare hosts/transcodes it from there.
//
// If CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_API_TOKEN are not configured,
// this honestly returns an error naming exactly what's missing rather than
// pretending an upload URL was issued.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
  role: string | null;
  permissions: Record<string, string[]> | null;
};
type ResolvedCaller =
  { ok: true; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

async function resolveActiveCaller(
  req: Request,
  serviceClient: SupabaseClient,
): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer "))
    return { ok: false, status: 401, error: "Missing bearer token" };
  const token = authHeader.replace("Bearer ", "");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Invalid session" };
  const { data: teamMember, error: memberErr } = await serviceClient
    .from("team_members")
    .select("id, user_id, is_active, role, permissions")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (memberErr) return { ok: false, status: 500, error: "Failed to resolve staff record" };
  if (!teamMember) return { ok: false, status: 403, error: "Account not provisioned." };
  if (teamMember.is_active === false)
    return { ok: false, status: 403, error: "Account is inactive." };
  return { ok: true, teamMember: teamMember as TeamMemberRow };
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const caller = await resolveActiveCaller(req, supabase);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  if (!hasPermission(caller.teamMember, "properties", "edit")) {
    return json({ error: "Not authorized to upload property video" }, 403);
  }

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  if (!accountId || !apiToken) {
    return json(
      {
        error:
          "Cloudflare Stream is not configured yet. Missing CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_STREAM_API_TOKEN as Edge Function secrets.",
        configured: false,
      },
      501,
    );
  }

  let body: { maxDurationSeconds?: number } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine, defaults apply
  }

  const cfResp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxDurationSeconds: body.maxDurationSeconds ?? 600,
        requireSignedURLs: false,
      }),
    },
  );
  const cfData = await cfResp.json();
  if (!cfResp.ok || !cfData?.success) {
    const message =
      cfData?.errors?.[0]?.message ?? `Cloudflare Stream request failed (HTTP ${cfResp.status})`;
    return json({ error: message, configured: true }, 502);
  }

  return json({
    ok: true,
    uploadURL: cfData.result.uploadURL,
    uid: cfData.result.uid,
  });
});
