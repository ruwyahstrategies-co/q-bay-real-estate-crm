import { sb, type LeadInsert, type LeadUpdate } from "@/lib/db";
import type { ExistingLeadRef, LeadImportClient } from "@/lib/lead-import";

const PAGE = 1000;

/**
 * Every lead the signed-in user is allowed to see, as just enough to spot duplicates. Row level
 * security decides what "allowed" means, so an agent is only matched against their own leads and
 * a manager against their team's. Paged because a single request stops at 1000 rows.
 */
export async function fetchExistingLeadRefs(): Promise<ExistingLeadRef[]> {
  const out: ExistingLeadRef[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("leads")
      .select("id, phone, email")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * The importer's database operations. Inserts deliberately do not ask for the rows back:
 * PostgREST returns inserted rows under the SELECT policy, so an agent assigning a lead to a
 * colleague would otherwise have the whole insert refused for a row they may not read.
 */
export function createSupabaseImportClient(): LeadImportClient {
  return {
    async insertLeads(rows) {
      const { error } = await sb.from("leads").insert(rows as LeadInsert[]);
      return error ? { code: error.code, message: error.message } : null;
    },
    async updateLead(id, patch) {
      const { data, error } = await sb
        .from("leads")
        .update(patch as LeadUpdate)
        .eq("id", id)
        .select("id");
      if (error) return { error: { code: error.code, message: error.message }, updated: false };
      return { error: null, updated: (data ?? []).length > 0 };
    },
    async insertHistory(rows) {
      await sb.from("pipeline_history").insert(rows);
    },
  };
}

/** How many of these leads the signed-in user can see right now. */
export async function countVisibleLeads(ids: string[]): Promise<number> {
  let visible = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { count, error } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("id", ids.slice(i, i + 100));
    if (error) throw error;
    visible += count ?? 0;
  }
  return visible;
}
