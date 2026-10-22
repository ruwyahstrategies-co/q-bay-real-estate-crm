import { useQuery } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import { Card } from "./ui-primitives";
import { useTeamMembers } from "@/hooks/use-team";
import { sb } from "@/lib/db";
import { fmtQatarDateTime } from "@/lib/qatar-time";

export type AssignmentEvent = {
  id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  actor_team_member_id: string | null;
  reason: string | null;
  created_at: string;
  event_type: string;
  mode: string | null;
};

export function useAssignmentEvents(entity: "lead" | "owner", id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["assignment_events", entity, id ?? "none"],
    queryFn: async (): Promise<AssignmentEvent[]> => {
      const { data, error } = await sb
        .from("assignment_events")
        .select("id, from_agent_id, to_agent_id, actor_team_member_id, reason, created_at, event_type, mode")
        .eq("entity_type", entity)
        .eq("entity_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AssignmentEvent[];
    },
  });
}

const MODE_LABEL: Record<string, string> = {
  start_over: "pipeline starts over",
  continue: "continues from the previous agent",
};

/** What happened in one step of a handover, in words. `name` turns an agent id into a name. */
export function describeAssignmentEvent(e: AssignmentEvent, name: (id: string | null) => string): { title: string; detail: string } {
  const mode = e.mode ? MODE_LABEL[e.mode] : null;
  const by = e.actor_team_member_id ? name(e.actor_team_member_id) : null;
  const tail = e.reason ? `: ${e.reason}` : "";
  switch (e.event_type) {
    case "requested":
      return {
        title: `Handover requested: ${name(e.from_agent_id)} to ${name(e.to_agent_id)}`,
        detail: `Requested by ${by ?? "the system"}${mode ? ` (${mode})` : ""}${tail}`,
      };
    case "accepted":
      return { title: `${name(e.to_agent_id)} accepted the lead`, detail: `Accepted by ${by ?? name(e.to_agent_id)}${tail}` };
    case "rejected":
      return { title: `${name(e.to_agent_id)} declined the lead`, detail: `Declined by ${by ?? name(e.to_agent_id)}${tail}` };
    case "expired":
      return { title: `Handover to ${name(e.to_agent_id)} expired`, detail: "No answer before the deadline. The lead stayed with the current agent." };
    case "cancelled":
      return { title: `Handover to ${name(e.to_agent_id)} withdrawn`, detail: `Withdrawn by ${by ?? "the requester"}` };
    default:
      return {
        title: `${name(e.from_agent_id)} to ${name(e.to_agent_id)}`,
        detail: `Reassigned${by ? ` by ${by}` : ""}${mode ? ` (${mode})` : ""}${tail}`,
      };
  }
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
        {events.map((e) => {
          const d = describeAssignmentEvent(e, name);
          return (
            <li key={e.id} className="rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{d.title}</span>
                <span className="tabular-nums text-muted-foreground">{fmtQatarDateTime(e.created_at)}</span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{d.detail}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
