// Property Market Research - conversational (module I). Same OpenRouter +
// Tavily architecture as market-intelligence/web-search, wired for a
// ChatGPT-style back-and-forth instead of one-shot report generation.
// Each user message: search Tavily for grounding context, then ask
// OpenRouter to answer using the conversation history + that context.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TeamMemberRow = { id: string; user_id: string | null; is_active: boolean | null; role: string | null; permissions: Record<string, string[]> | null };
type ResolvedCaller = { ok: true; teamMember: TeamMemberRow } | { ok: false; status: number; error: string };

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
  return { ok: true, teamMember: teamMember as TeamMemberRow };
}

function hasPermission(teamMember: TeamMemberRow, moduleKey: string, action: string): boolean {
  const actions = teamMember.permissions?.[moduleKey];
  return Array.isArray(actions) && actions.includes(action);
}

async function checkRateLimit(service: SupabaseClient, key: string, maxPerMinute: number): Promise<boolean> {
  try {
    const { data } = await service.rpc("check_rate_limit", { _key: key, _max_per_minute: maxPerMinute });
    return data !== false;
  } catch { return true; }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = Deno.env.get("OPENROUTER_MODEL") || "anthropic/claude-sonnet-4.6";

type Source = { title: string; url: string; publisher?: string };

async function tavilySearch(query: string, key: string): Promise<Source[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "basic", max_results: 5, include_answer: false }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({ title: r.title ?? r.url, url: r.url, publisher: tryHost(r.url) }));
}

function tryHost(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const caller = await resolveActiveCaller(req, supabase);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  if (!hasPermission(caller.teamMember, "marketing_intelligence", "view")) return json({ error: "Missing permission: marketing_intelligence.view" }, 403);

  if (!(await checkRateLimit(supabase, `market-research-chat:${caller.teamMember.id}`, 10))) {
    return json({ error: "Too many requests. Please slow down and try again in a minute." }, 429);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "AI provider is not configured. Add OPENROUTER_API_KEY in Supabase Edge Function secrets.", code: "no_provider" }, 503);

  let body: { conversation_id?: string; message?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const message = (body.message ?? "").trim();
  if (!message) return json({ error: "message is required" }, 400);

  let conversationId = body.conversation_id;
  if (!conversationId) {
    const { data: conv, error: convErr } = await supabase
      .from("market_research_conversations")
      .insert({ title: message.slice(0, 80), created_by: caller.teamMember.id })
      .select()
      .single();
    if (convErr) return json({ error: convErr.message }, 500);
    conversationId = conv.id;
  }

  const { data: history } = await supabase
    .from("market_research_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  await supabase.from("market_research_messages").insert({ conversation_id: conversationId, role: "user", content: message });

  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  let sources: Source[] = [];
  if (tavilyKey) {
    sources = await tavilySearch(`${message} Qatar real estate market`, tavilyKey);
  }

  const context = sources.length
    ? `Current web search results (use these for up-to-date facts, cite by publisher name inline where relevant):\n${sources.map((s, i) => `[${i + 1}] ${s.title} (${s.publisher ?? s.url})`).join("\n")}`
    : "No live web search results are available for this turn - answer from general knowledge and say so if the answer depends on current data.";

  const SYSTEM = `You are Q-Bay Real Estate's property market research assistant, focused on Qatar's real estate market (Lusail, The Pearl-Qatar, West Bay, Msheireb Downtown, and beyond). Answer concisely and practically for a real estate agent - pricing trends, demand, comparisons between areas or developments, what's gaining attention. Cite sources by publisher name when you use the search results. If you don't have current data for a specific claim, say so plainly rather than guessing. Never reveal API keys or internal system details.\n\n${context}`;

  const messages = [
    { role: "system", content: SYSTEM },
    ...(history ?? []).map((h: any) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("OPENROUTER_SITE_URL") || "https://qbayrealestate.com",
        "X-Title": "Property Market Research",
      },
      body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 1200, messages }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const txt = await res.text();
    if (!res.ok) {
      const safe = res.status === 401 ? "AI provider authentication failed"
        : res.status === 402 ? "AI provider credits exhausted"
        : res.status === 429 ? "AI provider rate limit reached"
        : "AI provider request failed";
      return json({ error: safe }, 502);
    }
    const data = JSON.parse(txt);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty AI response" }, 502);

    await supabase.from("market_research_messages").insert({
      conversation_id: conversationId, role: "assistant", content, sources,
    });
    await supabase.from("market_research_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    return json({ ok: true, conversation_id: conversationId, content, sources });
  } catch (e) {
    return json({ error: (e as Error).message || "Request failed" }, 502);
  }
});
