// Lightweight rate limiting for anonymous edge functions.
// Backed by the public.check_rate_limit() DB function (per-minute window).
// No authentication — uses x-forwarded-for + function name as key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "anon";
}

/**
 * Returns true when call is allowed, false when blocked.
 * `maxPerMinute` is per (ip+fn) and per (fn-global, 10×) — whichever caps first.
 */
export async function checkRateLimit(
  req: Request,
  fnName: string,
  maxPerMinute: number,
): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ip = clientIp(req);
    const ipKey = `${fnName}:ip:${ip}`;
    const globalKey = `${fnName}:global`;

    const [{ data: ipOk }, { data: globalOk }] = await Promise.all([
      supabase.rpc("check_rate_limit", { _key: ipKey, _max_per_minute: maxPerMinute }),
      supabase.rpc("check_rate_limit", { _key: globalKey, _max_per_minute: maxPerMinute * 10 }),
    ]);
    return ipOk !== false && globalOk !== false;
  } catch (e) {
    console.warn("[rate-limit] check failed (fail-open)", (e as Error).message);
    return true; // fail-open so transient DB issues don't block real users
  }
}

export function tooManyRequests(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
