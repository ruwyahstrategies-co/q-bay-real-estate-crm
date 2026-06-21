// Server-side web research. Manual refresh only.
// Uses TAVILY_API_KEY when present, falling back to SERPER_API_KEY.
// Never returns the raw API key. Stores results in external_market_sources.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type SearchResult = {
  title: string;
  url: string;
  content: string;
  publisher?: string;
};

async function tavilySearch(query: string, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    title: r.title ?? r.url,
    url: r.url,
    content: r.content ?? "",
    publisher: tryHost(r.url),
  }));
}

async function serperSearch(query: string, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Serper error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.organic ?? []).map((r: any) => ({
    title: r.title ?? r.link,
    url: r.link,
    content: r.snippet ?? "",
    publisher: tryHost(r.link),
  }));
}

function tryHost(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

async function fetchPageSummary(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 BuyerIntelligenceBot/1.0" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    const html = (await res.text()).slice(0, 80_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1200);
  } catch {
    return null;
  }
}

// crude location / type / price extraction
const PRICE_RE = /(?:AED|QAR|USD|EUR|GBP|SAR|\$)\s?[\d,]{4,}/gi;

function extractPriceInfo(text: string): Record<string, unknown> | null {
  const matches = text.match(PRICE_RE);
  if (!matches || matches.length === 0) return null;
  return { sample_mentions: matches.slice(0, 4) };
}

function matchAny(text: string, terms: string[]): string[] {
  const t = text.toLowerCase();
  return Array.from(new Set(terms.filter((term) => term && t.includes(term.toLowerCase()))));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const tavily = Deno.env.get("TAVILY_API_KEY");
  const serper = Deno.env.get("SERPER_API_KEY");
  const provider = tavily ? "tavily" : serper ? "serper" : null;
  if (!provider) {
    return json({
      error: "Web search provider is not configured. Add TAVILY_API_KEY (recommended) or SERPER_API_KEY in Lovable Cloud secrets.",
      code: "no_provider",
    }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Mode A: ingest a specific URL
  if (body?.url && typeof body.url === "string") {
    const url = body.url.trim();
    if (!/^https?:\/\//i.test(url)) return json({ error: "Invalid URL" }, 400);
    const summary = (await fetchPageSummary(url)) ?? "Page could not be summarised automatically.";
    const title = summary.slice(0, 80) || url;
    const row = {
      query: body.query ?? null,
      title,
      publisher: tryHost(url),
      url,
      summary,
      relevant_locations: [],
      relevant_property_types: [],
      price_info: extractPriceInfo(summary),
      raw: { source: "manual" },
      retrieved_at: new Date().toISOString(),
      active: true,
    };
    const { error } = await supabase
      .from("external_market_sources")
      .upsert(row, { onConflict: "url" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, inserted: 1 });
  }

  // Mode B: query-based search
  const query: string = body?.query;
  if (!query || typeof query !== "string") return json({ error: "query required" }, 400);

  const locationsHint: string[] = Array.isArray(body?.locations) ? body.locations : [];
  const typesHint: string[] = Array.isArray(body?.property_types) ? body.property_types : [];

  let results: SearchResult[];
  try {
    results = provider === "tavily" ? await tavilySearch(query, tavily!) : await serperSearch(query, serper!);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  if (results.length === 0) return json({ ok: true, inserted: 0, results: [] });

  const rows = results.map((r) => ({
    query,
    title: r.title.slice(0, 240),
    publisher: r.publisher ?? null,
    url: r.url,
    summary: r.content.slice(0, 1200),
    relevant_locations: matchAny(r.content, locationsHint),
    relevant_property_types: matchAny(r.content, typesHint),
    price_info: extractPriceInfo(r.content),
    raw: { provider },
    retrieved_at: new Date().toISOString(),
    active: true,
  }));

  const { error } = await supabase
    .from("external_market_sources")
    .upsert(rows, { onConflict: "url" });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, inserted: rows.length, provider });
});
