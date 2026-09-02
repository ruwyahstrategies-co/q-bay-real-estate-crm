import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type ReassignmentCategory = "leads" | "properties" | "developments" | "owners" | "viewings" | "offers" | "tasks" | "transactions";

const CATEGORY_TABLE: Record<ReassignmentCategory, { table: string; column: string }> = {
  leads: { table: "leads", column: "assigned_agent_id" },
  properties: { table: "properties", column: "assigned_agent_id" },
  developments: { table: "developments", column: "assigned_agent_id" },
  owners: { table: "owners", column: "assigned_agent_id" },
  viewings: { table: "viewings", column: "assigned_agent_id" },
  offers: { table: "offers", column: "agent_id" },
  tasks: { table: "tasks", column: "assigned_to" },
  transactions: { table: "transactions", column: "agent_id" },
};

/** Record counts per category for a team member - shown before a reassignment/deletion is confirmed. */
export function useAssignedRecordCounts(teamMemberId: string | undefined) {
  return useQuery({
    queryKey: ["reassignment", "counts", teamMemberId ?? "none"],
    enabled: !!teamMemberId,
    queryFn: async (): Promise<Record<ReassignmentCategory, number>> => {
      const entries = await Promise.all(
        (Object.keys(CATEGORY_TABLE) as ReassignmentCategory[]).map(async (cat) => {
          const { table, column } = CATEGORY_TABLE[cat];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table name is looped generically across categories
          const { count, error } = await (sb as any).from(table).select("id", { count: "exact", head: true }).eq(column, teamMemberId!);
          if (error) throw error;
          return [cat, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<ReassignmentCategory, number>;
    },
  });
}

export function useReassignTeamMemberRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromAgentId: string; targets: Partial<Record<ReassignmentCategory, string>> }) => {
      const { data, error } = await sb.rpc("reassign_team_member_records", {
        _from_agent_id: input.fromAgentId,
        _to_leads: input.targets.leads,
        _to_properties: input.targets.properties,
        _to_developments: input.targets.developments,
        _to_owners: input.targets.owners,
        _to_viewings: input.targets.viewings,
        _to_offers: input.targets.offers,
        _to_tasks: input.targets.tasks,
        _to_transactions: input.targets.transactions,
      });
      if (error) throw error;
      return data as Record<ReassignmentCategory, number>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reassignment"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["developments"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["viewings"] });
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
