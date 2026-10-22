import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type LeadInsert, type LeadUpdate, type Lead, type Owner } from "@/lib/db";
import { OWNER_COLUMNS } from "@/lib/owner-privacy";

export const leadsKeys = {
  all: ["leads"] as const,
  list: (filters?: Record<string, unknown>) => ["leads", "list", filters ?? {}] as const,
  detail: (id: string) => ["leads", "detail", id] as const,
};

/** Marks "no agent" in the agent filter, so unassigned leads can be listed. */
export const UNASSIGNED_AGENT = "__unassigned__";

export type LeadFilters = {
  search?: string;
  stage?: string | null;
  /** An agent id, or UNASSIGNED_AGENT for leads nobody owns. */
  agent?: string | null;
  status?: "active" | "archived" | "all";
  classification?: string | null;
  workflow?: string | null;
  developmentId?: string | null;
  intent?: "sale" | "rent" | null;
  source?: string | null;
  priority?: string | null;
  /** yyyy-mm-dd, inclusive, on the day the lead was created. */
  createdFrom?: string | null;
  createdTo?: string | null;
  /** Leads whose budget range overlaps this range. */
  budgetMin?: number | null;
  budgetMax?: number | null;
  countryId?: string | null;
  areaId?: string | null;
  /** A filterable custom field. select/boolean match exactly, text contains. */
  customField?: { key: string; type: string; value: string } | null;
};

export function useLeads(opts?: LeadFilters) {
  const {
    search = "",
    stage = null,
    agent = null,
    status = "active",
    classification = null,
    workflow = null,
    developmentId = null,
    intent = null,
    source = null,
    priority = null,
    createdFrom = null,
    createdTo = null,
    budgetMin = null,
    budgetMax = null,
    countryId = null,
    areaId = null,
    customField = null,
  } = opts ?? {};
  return useQuery({
    queryKey: leadsKeys.list({
      search, stage, agent, status, classification, workflow, developmentId, intent,
      source, priority, createdFrom, createdTo, budgetMin, budgetMax, countryId, areaId, customField,
    }),
    queryFn: async (): Promise<Lead[]> => {
      let q = sb.from("leads").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (stage) q = q.eq("pipeline_stage", stage);
      if (agent === UNASSIGNED_AGENT) q = q.is("assigned_agent_id", null);
      else if (agent) q = q.eq("assigned_agent_id", agent);
      if (classification) q = q.eq("classification", classification);
      if (workflow) q = q.eq("workflow", workflow);
      if (developmentId) q = q.eq("development_id", developmentId);
      if (intent) q = q.eq("transaction_intent", intent);
      if (source) q = q.eq("lead_source", source);
      if (priority) q = q.eq("priority", priority);
      if (createdFrom) q = q.gte("created_at", localDayStart(createdFrom));
      if (createdTo) q = q.lt("created_at", localDayStart(createdTo, 1));
      // A lead's budget is a range. It matches when that range overlaps the one asked for.
      if (budgetMin != null) q = q.gte("budget_max", budgetMin);
      if (budgetMax != null) q = q.lte("budget_min", budgetMax);
      if (countryId) q = q.eq("preferred_country_id", countryId);
      if (areaId) q = q.eq("preferred_area_id", areaId);
      if (customField && customField.value !== "") {
        const { key, type, value } = customField;
        if (type === "multiselect") q = q.contains("custom_fields", { [key]: [value] });
        else if (type === "boolean" || type === "checkbox") q = q.contains("custom_fields", { [key]: value === "true" });
        else if (type === "select") q = q.contains("custom_fields", { [key]: value });
        else q = q.ilike(`custom_fields->>${key}`, `%${value.replace(/[%,()]/g, " ")}%`);
      }
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Midnight (the user's own time zone) at the start of a yyyy-mm-dd date, plus optional whole days, as a UTC timestamp. */
function localDayStart(iso: string, addDays = 0): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + addDays);
  return d.toISOString();
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: id ? leadsKeys.detail(id) : ["leads", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("leads").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadInsert): Promise<Lead> => {
      // The id is chosen here and the insert does not ask for the row back. PostgREST returns
      // inserted rows under the SELECT policy, so an agent who assigns a lead to a colleague
      // would otherwise have the whole insert refused for a row they are not allowed to read.
      const id = input.id ?? crypto.randomUUID();
      const { error } = await sb.from("leads").insert({ ...input, id });
      if (error) throw error;
      // The first pipeline_history row is written by the database when the lead is inserted.
      const { data } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
      return data ?? ({ ...input, id } as Lead);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadUpdate }) => {
      const { data, error } = await sb.from("leads").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.detail(vars.id) });
    },
  });
}

/**
 * Moves a lead to another pipeline stage. The database enforces who may do it (forward-only for ordinary
 * staff, any direction for a Super Administrator, Won only for people who can finalise a deal) and records
 * the pipeline_history row itself, with the optional reason, so a refused move surfaces here as an error and
 * a successful one is recorded exactly once, whichever screen made it.
 */
export function useChangePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newStage, reason }: { id: string; newStage: string; previousStage?: string; reason?: string }) => {
      const { error } = await sb.rpc("move_lead_stage", {
        _lead_id: id,
        _stage: newStage,
        _reason: reason?.trim() || undefined,
      });
      if (error) throw error;
      return newStage;
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: ["pipeline_history"] });
      qc.invalidateQueries({ queryKey: ["refs"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: leadsKeys.detail(vars.id) });
    },
  });
}

export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("leads")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

/**
 * Marks a Rent lead as rented from outside Q-Bay: a closed outcome (the lead leaves the working
 * pipeline as Lost), with the date, who and a short note kept on the lead. It creates no Q-Bay
 * transaction. Runs as one database action under the caller's own permissions.
 */
export function useMarkLeadRentedFromOutside() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await sb.rpc("mark_lead_rented_from_outside", {
        _lead_id: id,
        _note: note?.trim() ? note.trim() : undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: ["lead_notes"] });
      qc.invalidateQueries({ queryKey: ["pipeline_history"] });
    },
  });
}

/**
 * Permanently deletes one lead through the same safe database function the bulk Delete uses. A lead that
 * still has conversations, tasks, viewings, offers or other linked history is refused (archive it
 * instead), so nothing is cascade-deleted by accident.
 */
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.rpc("bulk_delete_leads", { _ids: [id] });
      if (error) throw error;
      const result = data as unknown as { deleted: number; blocked: { name: string; linked: Record<string, number> }[] };
      if (result.deleted === 0) {
        const blocked = result.blocked?.[0];
        throw new Error(
          blocked
            ? `${blocked.name} cannot be deleted because it still has linked records (${describeLinks(blocked.linked)}). Archive it instead.`
            : "This lead could not be deleted. You may not have access to it.",
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: leadsKeys.all }),
  });
}

/** "3 tasks, 2 viewings" for the records that block a delete. */
export function describeLinks(linked: Record<string, number> | null | undefined): string {
  const parts = Object.entries(linked ?? {}).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`);
  return parts.length ? parts.join(", ") : "other records";
}

/** Converts a Won lead into an Owner, idempotently (returns the existing Owner if already converted). Links back via owners.source_lead_id / leads.converted_owner_id. */
export function useConvertLeadToOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead: Lead): Promise<Omit<Owner, "phone" | "id_number">> => {
      if (lead.converted_owner_id) {
        const { data, error } = await sb
          .from("owners")
          .select(OWNER_COLUMNS)
          .eq("id", lead.converted_owner_id)
          .single();
        if (error) throw error;
        return data;
      }

      if (!lead.phone || !lead.phone.trim()) {
        throw new Error("Add a phone number to this lead before converting it to an owner.");
      }

      let developmentName: string | null = null;
      if (lead.development_id) {
        const { data: dev } = await sb.from("developments").select("name").eq("id", lead.development_id).maybeSingle();
        developmentName = dev?.name ?? null;
      }

      const notesParts = [
        `Converted from lead "${lead.full_name}" on ${new Date().toLocaleDateString()}.`,
        developmentName ? `Interested development: ${developmentName}.` : null,
        lead.notes ? `Lead notes: ${lead.notes}` : null,
      ].filter(Boolean);

      const { data: owner, error: insertErr } = await sb
        .from("owners")
        .insert({
          name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          assigned_agent_id: lead.assigned_agent_id,
          source_lead_id: lead.id,
          notes: notesParts.join(" "),
        })
        .select(OWNER_COLUMNS)
        .single();
      if (insertErr) throw insertErr;

      const { error: updateErr } = await sb.from("leads").update({ converted_owner_id: owner.id }).eq("id", lead.id);
      if (updateErr) throw updateErr;

      return owner;
    },
    onSuccess: (_owner, lead) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.detail(lead.id) });
      qc.invalidateQueries({ queryKey: ["owners"] });
    },
  });
}
