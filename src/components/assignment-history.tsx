import { useQuery } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import { Card } from "./ui-primitives";
import { useTeamMembers } from "@/hooks/use-team";
import { sb } from "@/lib/db";
import { fmtQatarDateTime } from "@/lib/qatar-time";

type AssignmentEvent = {
  id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  actor_team_member_id: string | null;
  reason: string | null;
  created_at: string;
};

function useAssignmentEvents(entity: "lead" | "owner", id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["assignment_events", entity, id ?? "none"],
    queryFn: async (): Promise<AssignmentEvent[]> => {
      const { data, error } = await sb
        .from("assignment_events")
        .select("id, from_agent_id, to_agent_id, actor_team_member_id, reason, created_at")
        .eq("entity_type", entity)
        .eq("entity_id", id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AssignmentEvent[];
    },
  });
}

/** Who a lead or owner has been reassigned between, when, and by whom. Hidden until there is a history. */
export function AssignmentHistory({ entity, id }: { entity: "lead" | "owner"; id: string }) {
  const { data: events = [] } = useAssignmentEvents(entity, id);
  const { data: team = [] } = useTeamMembers();
  if (events.length === 0) return null;
  const name = (agentId: string | null) => (agentId ? (team.find((m) => m.id === agentId)?.full_name ?? "a team member") : "Unassigned");

  return (
    <Card className="md:col-span-2">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Assignment history</h4>
      </div>
      <ol className="mt-3 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {name(e.from_agent_id)} to {name(e.to_agent_id)}
              </span>
              <span className="tabular-nums text-muted-foreground">{fmtQatarDateTime(e.created_at)}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">
              Reassigned by {name(e.actor_team_member_id)}
              {e.reason ? `: ${e.reason}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
