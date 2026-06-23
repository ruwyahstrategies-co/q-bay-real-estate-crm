// Server-side tools that the ElevenLabs agent calls during a live conversation.
// All tools enforce receptionist-safe data shapes and never expose secrets.
//
// Expected request body:
//   { tool: string, conversation_id?: string, params: Record<string, unknown> }
//
// To wire up in ElevenLabs: configure each tool as a Webhook tool pointing at
// this function with header `x-tool: <tool_name>` OR pass `tool` in the body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tool",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function normalisePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-12) : null;
}

async function logToolEvent(
  conversationId: string | null,
  toolName: string,
  request: unknown,
  result: unknown,
  success: boolean,
  error: string | null,
) {
  try {
    let callId: string | null = null;
    if (conversationId) {
      const { data } = await supabase
        .from("receptionist_calls")
        .select("id")
        .eq("elevenlabs_conversation_id", conversationId)
        .maybeSingle();
      callId = data?.id ?? null;
    }
    await supabase.from("receptionist_tool_events").insert({
      call_id: callId,
      elevenlabs_conversation_id: conversationId,
      tool_name: toolName,
      request_summary: request as never,
      result_summary: result as never,
      success,
      error,
    });
  } catch (e) {
    console.warn("[receptionist-tools] log failed", (e as Error).message);
  }
}

// ──────────────────────── Tool implementations ────────────────────────

async function findLeadByPhone(params: { phone?: string }) {
  const norm = normalisePhone(params.phone);
  if (!norm) return { found: false, reason: "invalid_phone" };

  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, pipeline_stage, budget_min, budget_max, currency, preferred_locations, property_type_preferences, bedrooms_min, last_contacted_at")
    .ilike("phone", `%${norm.slice(-8)}%`)
    .limit(1);

  const lead = leads?.[0];
  if (!lead) return { found: false };

  // Fetch latest interaction summary
  const { data: lastInter } = await supabase
    .from("interactions")
    .select("summary, occurred_at")
    .eq("lead_id", lead.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: interests } = await supabase
    .from("lead_property_interests")
    .select("property_id, properties(name, location)")
    .eq("lead_id", lead.id)
    .limit(3);

  return {
    found: true,
    lead_id: lead.id,
    first_name: lead.first_name,
    pipeline_stage: lead.pipeline_stage,
    budget: {
      min: lead.budget_min,
      max: lead.budget_max,
      currency: lead.currency,
    },
    preferred_locations: lead.preferred_locations ?? [],
    property_types: lead.property_type_preferences ?? [],
    bedrooms_min: lead.bedrooms_min,
    last_contacted_at: lead.last_contacted_at,
    last_summary: lastInter?.summary ?? null,
    interested_properties:
      interests?.map((i) => ({
        property_id: i.property_id,
        // deno-lint-ignore no-explicit-any
        name: (i as any).properties?.name,
        // deno-lint-ignore no-explicit-any
        location: (i as any).properties?.location,
      })) ?? [],
  };
}

async function createOrUpdateLead(params: Record<string, unknown>) {
  const phone = normalisePhone(params.phone as string);
  if (!phone && !params.email) return { ok: false, reason: "phone_or_email_required" };

  const search = phone
    ? await supabase.from("leads").select("id").ilike("phone", `%${phone.slice(-8)}%`).limit(1)
    : await supabase.from("leads").select("id").eq("email", params.email as string).limit(1);

  const existing = search.data?.[0];

  // Only overwrite fields the agent reports as confirmed (truthy values)
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    first_name: "first_name",
    last_name: "last_name",
    email: "email",
    preferred_language: "preferred_language",
    buyer_type: "buyer_type",
    budget_min: "budget_min",
    budget_max: "budget_max",
    currency: "currency",
    preferred_locations: "preferred_locations",
    property_type_preferences: "property_type_preferences",
    bedrooms_min: "bedrooms_min",
    purchase_purpose: "purchase_purpose",
    buying_timeline: "buying_timeline",
    financing_status: "financing_status",
    must_have_features: "must_have_features",
    notes: "notes",
  };
  for (const [k, v] of Object.entries(params)) {
    if (map[k] && v !== null && v !== undefined && v !== "") patch[map[k]] = v;
  }
  if (phone) patch.phone = phone;
  if (!existing) patch.source = patch.source ?? "ai_receptionist";

  if (existing) {
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, lead_id: data.id, created: false };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...patch, pipeline_stage: "new_lead" } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead_id: data.id, created: true };
}

async function searchProperties(params: {
  budget_max?: number;
  budget_min?: number;
  location?: string;
  property_type?: string;
  bedrooms_min?: number;
  features?: string[];
}) {
  let q = supabase
    .from("properties")
    .select("id, name, location, price, currency, bedrooms, property_type, availability_status, completion_status, key_features")
    .limit(3);

  if (params.budget_max) q = q.lte("price", params.budget_max);
  if (params.budget_min) q = q.gte("price", params.budget_min);
  if (params.location) q = q.ilike("location", `%${params.location}%`);
  if (params.property_type) q = q.ilike("property_type", `%${params.property_type}%`);
  if (params.bedrooms_min) q = q.gte("bedrooms", params.bedrooms_min);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, properties: [] };
  return { ok: true, count: data?.length ?? 0, properties: data ?? [] };
}

async function getPropertyDetails(params: { property_id?: string }) {
  if (!params.property_id) return { ok: false, reason: "property_id_required" };
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, location, price, currency, bedrooms, availability_status, key_features, viewing_availability")
    .eq("id", params.property_id)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "not_found" };
  return { ok: true, property: data };
}

async function createCallbackTask(params: {
  lead_id?: string;
  callback_time?: string;
  notes?: string;
  conversation_id?: string;
}) {
  if (!params.lead_id) return { ok: false, reason: "lead_id_required" };
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      lead_id: params.lead_id,
      title: "Receptionist callback request",
      description: params.notes ?? null,
      due_at: params.callback_time ?? null,
      status: "pending",
      priority: "high",
      refs: { source: "ai_receptionist", conversation_id: params.conversation_id } as never,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, task_id: data.id };
}

async function requestViewing(params: {
  lead_id?: string;
  property_id?: string;
  preferred_time?: string;
  conversation_id?: string;
}) {
  if (!params.lead_id || !params.property_id) return { ok: false, reason: "lead_id_and_property_id_required" };
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      lead_id: params.lead_id,
      property_id: params.property_id,
      title: "Viewing request (unconfirmed)",
      description: `Caller requested a viewing. Preferred time: ${params.preferred_time ?? "not specified"}. Confirm availability before responding.`,
      status: "pending",
      priority: "high",
      refs: { source: "ai_receptionist", conversation_id: params.conversation_id, confirmed: false } as never,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Record interest
  await supabase.from("lead_property_interests").upsert(
    { lead_id: params.lead_id, property_id: params.property_id, interest_level: "high" } as never,
    { onConflict: "lead_id,property_id" },
  );

  return { ok: true, task_id: data.id, confirmed: false };
}

async function transferToHuman(params: { reason?: string; conversation_id?: string }) {
  const target = Deno.env.get("RECEPTIONIST_TRANSFER_NUMBER");
  if (!target) return { ok: false, reason: "transfer_number_not_configured" };
  // Update call row if exists
  if (params.conversation_id) {
    await supabase
      .from("receptionist_calls")
      .update({ transfer_status: "requested", transfer_target: target })
      .eq("elevenlabs_conversation_id", params.conversation_id);
  }
  return { ok: true, transfer_number: target, reason: params.reason };
}

// ──────────────────────── Router ────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!await checkRateLimit(req, "receptionist-tools", 30)) {
    return tooManyRequests(corsHeaders);
  }

  let body: { tool?: string; conversation_id?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tool = body.tool || req.headers.get("x-tool") || "";
  const params = { ...(body.params ?? {}), conversation_id: body.conversation_id };
  const convId = body.conversation_id ?? null;

  let result: unknown;
  let success = true;
  let errorMsg: string | null = null;

  try {
    switch (tool) {
      case "find_lead_by_phone": result = await findLeadByPhone(params as never); break;
      case "create_or_update_lead": result = await createOrUpdateLead(params); break;
      case "search_properties": result = await searchProperties(params as never); break;
      case "get_property_details": result = await getPropertyDetails(params as never); break;
      case "create_callback_task": result = await createCallbackTask(params as never); break;
      case "request_viewing": result = await requestViewing(params as never); break;
      case "transfer_to_human": result = await transferToHuman(params as never); break;
      default:
        success = false;
        errorMsg = `unknown_tool:${tool}`;
        result = { ok: false, error: errorMsg };
    }
  } catch (e) {
    success = false;
    errorMsg = (e as Error).message;
    result = { ok: false, error: errorMsg };
  }

  await logToolEvent(convId, tool, params, result, success, errorMsg);

  return new Response(JSON.stringify(result), {
    status: success ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
