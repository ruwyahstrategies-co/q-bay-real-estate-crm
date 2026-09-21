import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type SearchResultType = "Lead" | "Property" | "Owner" | "Development" | "Team member";

export type SearchResult = {
  key: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  to: string;
  params?: Record<string, string>;
};

const PER_TYPE = 6;

/** Strips characters that would break a PostgREST or() filter or act as wildcards. */
function cleanTerm(q: string): string {
  return q.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
}

const join = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((p): p is string => !!p).join(" · ");

/**
 * Searches the major CRM entities in parallel with small per-type limits. Every query runs
 * as the signed-in user, so row-level security decides what they can find. Owners go
 * through search_owners(), which withholds phone numbers the user is not entitled to and
 * never lets a phone match reveal a hidden number. A type the user cannot read simply
 * contributes no results.
 */
export function useGlobalSearch(query: string, enabled: boolean) {
  const term = cleanTerm(query);
  return useQuery({
    queryKey: ["global-search", term],
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResult[]> => {
      const like = `%${term}%`;
      const [leads, properties, owners, developments, team] = await Promise.allSettled([
        sb
          .from("leads")
          .select("id, full_name, phone, email, pipeline_stage, transaction_intent")
          .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .limit(PER_TYPE),
        sb
          .from("properties")
          .select("id, title, reference_code, location, availability")
          .or(`title.ilike.${like},reference_code.ilike.${like},location.ilike.${like}`)
          .limit(PER_TYPE),
        sb.rpc("search_owners", { _query: term, _limit: PER_TYPE }),
        sb.from("developments").select("id, name, status").ilike("name", like).limit(PER_TYPE),
        sb
          .from("team_members")
          .select("id, full_name, role, email")
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .limit(4),
      ]);

      const out: SearchResult[] = [];
      const rows = <T,>(r: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] =>
        r.status === "fulfilled" && !r.value.error ? (r.value.data ?? []) : [];

      for (const l of rows(leads)) {
        out.push({
          key: `lead:${l.id}`,
          type: "Lead",
          title: l.full_name,
          subtitle: join(l.phone, l.email, l.transaction_intent === "rent" ? "Rent" : "Sale"),
          to: "/leads/$leadId",
          params: { leadId: l.id },
        });
      }
      for (const p of rows(properties)) {
        out.push({
          key: `property:${p.id}`,
          type: "Property",
          title: join(p.reference_code, p.title),
          subtitle: join(p.location, p.availability),
          to: "/properties/$propertyId",
          params: { propertyId: p.id },
        });
      }
      for (const o of rows(owners)) {
        out.push({
          key: `owner:${o.id}`,
          type: "Owner",
          title: o.name,
          subtitle: join(o.company, o.code, o.phone_hidden ? "Phone hidden" : o.phone),
          to: "/owners/$ownerId",
          params: { ownerId: o.id },
        });
      }
      for (const d of rows(developments)) {
        out.push({
          key: `development:${d.id}`,
          type: "Development",
          title: d.name,
          subtitle: d.status ?? "",
          to: "/developments/$developmentId",
          params: { developmentId: d.id },
        });
      }
      for (const m of rows(team)) {
        out.push({
          key: `team:${m.id}`,
          type: "Team member",
          title: m.full_name,
          subtitle: join(m.role?.replace(/_/g, " "), m.email),
          to: "/team",
        });
      }
      return out;
    },
  });
}
