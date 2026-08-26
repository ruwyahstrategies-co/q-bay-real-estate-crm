// Public website enquiry intake — the ONLY way an anonymous visitor's
// message can reach the CRM. Anonymous callers can never write to `leads`
// or `website_enquiries` directly (no RLS policy permits it); this function
// validates, normalises, finds-or-creates the lead, assigns the property's/
// development's agent, and logs an interaction, all via the service role.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function checkRateLimit(req: Request, service: SupabaseClient, fnName: string, maxPerMinute: number): Promise<boolean> {
  try {
    const xf = req.headers.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0].trim() : req.headers.get("cf-connecting-ip") || "anon";
    const [{ data: ipOk }, { data: globalOk }] = await Promise.all([
      service.rpc("check_rate_limit", { _key: `${fnName}:ip:${ip}`, _max_per_minute: maxPerMinute }),
      service.rpc("check_rate_limit", { _key: `${fnName}:global`, _max_per_minute: maxPerMinute * 10 }),
    ]);
    return ipOk !== false && globalOk !== false;
  } catch { return true; }
}
function tooManyRequests(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-12) : null;
}

type Body = {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  property_id?: string;
  development_id?: string;
  source_url?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await checkRateLimit(req, service, "website-enquiry", 8)) return tooManyRequests(CORS);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const name = body.name?.trim();
  const phone = normalisePhone(body.phone);
  const email = body.email?.trim()?.toLowerCase() || null;
  const message = body.message?.trim() || null;

  if (!name) return json({ error: "name is required" }, 400);
  if (!phone && !email) return json({ error: "phone or email is required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid email" }, 400);

  let assignedAgentId: string | null = null;
  if (body.property_id) {
    const { data: p } = await service.from("properties").select("assigned_agent_id").eq("id", body.property_id).maybeSingle();
    assignedAgentId = p?.assigned_agent_id ?? null;
  } else if (body.development_id) {
    const { data: d } = await service.from("developments").select("assigned_agent_id").eq("id", body.development_id).maybeSingle();
    assignedAgentId = d?.assigned_agent_id ?? null;
  }

  // Find an existing lead by phone or email, else create one.
  let leadId: string | null = null;
  if (phone) {
    const { data: existing } = await service.from("leads").select("id").ilike("phone", `%${phone.slice(-8)}%`).limit(1).maybeSingle();
    leadId = existing?.id ?? null;
  }
  if (!leadId && email) {
    const { data: existing } = await service.from("leads").select("id").ilike("email", email).limit(1).maybeSingle();
    leadId = existing?.id ?? null;
  }

  if (!leadId) {
    const { data: created, error } = await service.from("leads").insert({
      full_name: name,
      phone,
      email,
      lead_source: "website",
      pipeline_stage: "new_lead",
      assigned_agent_id: assignedAgentId,
      notes: message,
    }).select("id").single();
    if (error || !created) return json({ error: "Failed to create lead" }, 500);
    leadId = created.id;
  } else if (assignedAgentId) {
    // Keep an existing but unassigned lead flowing to the right agent.
    await service.from("leads").update({ assigned_agent_id: assignedAgentId }).eq("id", leadId).is("assigned_agent_id", null);
  }

  await service.from("website_enquiries").insert({
    name,
    phone,
    email,
    message,
    property_id: body.property_id ?? null,
    development_id: body.development_id ?? null,
    source_url: body.source_url ?? null,
    assigned_agent_id: assignedAgentId,
    lead_id: leadId,
  });

  await service.from("interactions").insert({
    lead_id: leadId,
    interaction_type: "website_enquiry",
    direction: "inbound",
    subject: "Website enquiry",
    content: message,
    metadata: { property_id: body.property_id ?? null, development_id: body.development_id ?? null, source_url: body.source_url ?? null },
  });

  return json({ ok: true });
});
