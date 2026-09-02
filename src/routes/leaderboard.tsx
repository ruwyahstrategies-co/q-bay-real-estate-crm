import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { useLeads } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { useTasks } from "@/hooks/use-tasks";
import { useInteractions } from "@/hooks/use-interactions";
import { useViewings } from "@/hooks/use-viewings";
import { useTransactions } from "@/hooks/use-transactions";
import { useStaffActivityEvents } from "@/hooks/use-staff-activity";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: LeaderboardPage,
});

const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
] as const;

function LeaderboardPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30");
  const [view, setView] = useState<"sales" | "activity">("sales");
  const since = useMemo(() => (range === "all" ? null : new Date(Date.now() - Number(range) * 86400000)), [range]);
  const inRange = (iso: string | null | undefined) => !since || (!!iso && new Date(iso).getTime() >= since.getTime());

  const { data: team = [] } = useTeamMembers();
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: tasks = [] } = useTasks();
  const { data: interactions = [] } = useInteractions();
  const { data: viewings = [] } = useViewings();
  const { data: transactions = [] } = useTransactions();
  const { data: activityEvents = [] } = useStaffActivityEvents();

  const activeTeam = team.filter((m) => m.is_active !== false);

  const salesRows = useMemo(() => {
    return activeTeam
      .map((m) => {
        const myLeads = leads.filter((l) => l.assigned_agent_id === m.id && inRange(l.updated_at));
        const closedSales = myLeads.filter((l) => l.pipeline_stage === "won" && (l.purchase_purpose ?? "").toLowerCase() !== "rent").length;
        const closedRentals = myLeads.filter((l) => l.pipeline_stage === "won" && (l.purchase_purpose ?? "").toLowerCase() === "rent").length;
        const won = myLeads.filter((l) => l.pipeline_stage === "won").length;
        const lost = myLeads.filter((l) => l.pipeline_stage === "lost").length;
        const closed = won + lost;
        const pipelineValue = leads
          .filter((l) => l.assigned_agent_id === m.id && !["won", "lost"].includes(l.pipeline_stage))
          .reduce((a, l) => a + (l.budget_max ?? 0), 0);
        const myTx = transactions.filter((t) => t.agent_id === m.id && t.status === "closed" && inRange(t.closed_at));
        const revenue = myTx.reduce((a, t) => a + (t.transaction_value ?? 0), 0);
        const commission = myTx.reduce((a, t) => a + (t.commission_value ?? 0), 0);
        const myViewings = viewings.filter((v) => v.assigned_agent_id === m.id && inRange(v.created_at)).length;
        return {
          id: m.id,
          name: m.full_name,
          closedSales,
          closedRentals,
          conversion: closed ? Math.round((won / closed) * 100) : 0,
          pipelineValue,
          revenue,
          commission,
          viewings: myViewings,
          score: closedSales * 3 + closedRentals * 2 + commission / 1000,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeTeam, leads, transactions, viewings, since]);

  const activityRows = useMemo(() => {
    return activeTeam
      .map((m) => {
        const contacted = new Set(
          interactions.filter((i) => i.created_by === m.id && inRange(i.interaction_date) && i.lead_id).map((i) => i.lead_id),
        ).size;
        const followUpsCompleted = tasks.filter((t) => t.assigned_to === m.id && t.status === "completed" && inRange(t.completed_at)).length;
        const notesLogged = interactions.filter((i) => i.created_by === m.id && inRange(i.interaction_date)).length;
        const viewingsCompleted = viewings.filter((v) => v.assigned_agent_id === m.id && v.status === "completed" && inRange(v.completed_at)).length;
        const meaningfulActions = activityEvents.filter((e) => e.team_member_id === m.id && inRange(e.occurred_at)).length;
        return {
          id: m.id,
          name: m.full_name,
          contacted,
          followUpsCompleted,
          notesLogged,
          viewingsCompleted,
          meaningfulActions,
          score: contacted + followUpsCompleted * 2 + notesLogged + viewingsCompleted * 2 + meaningfulActions,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeTeam, interactions, tasks, viewings, activityEvents, since]);

  return (
    <AppShell>
      <PermissionGate module="staff_activity" action="view_all" page>
        <PageHeader
          eyebrow="Performance"
          title="Leaderboard"
          description="Sales performance and meaningful system activity, ranked."
          actions={
            <div className="flex items-center gap-2">
              <SelectField value={view} onChange={(v) => setView((v ?? "sales") as typeof view)} options={[{ value: "sales", label: "Sales" }, { value: "activity", label: "Activity" }]} allowClear={false} className="w-32" />
              <SelectField value={range} onChange={(v) => setRange((v ?? "30") as typeof range)} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} allowClear={false} className="w-40" />
            </div>
          }
        />

        {view === "sales" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {salesRows.slice(0, 3).map((r, i) => (
                <Card key={r.id} className="flex items-center gap-3">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", i === 0 ? "bg-pastel-cream" : i === 1 ? "bg-pastel-blue" : "bg-pastel-purple")}>
                    {i === 0 ? <Trophy className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.closedSales + r.closedRentals} closed · {fmtMoney(r.commission, "QAR")} commission</p>
                  </div>
                </Card>
              ))}
            </div>
            <DataTable
              columns={["Rank", "Agent", "Closed Sales", "Closed Rentals", "Conversion", "Pipeline Value", "Revenue", "Commission", "Viewings"]}
              empty={<EmptyState compact title="No data yet" />}
            >
              {salesRows.map((r, i) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3 text-xs font-medium">#{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.closedSales}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.closedRentals}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.conversion}%</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{fmtMoney(r.pipelineValue, "QAR")}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{fmtMoney(r.revenue, "QAR")}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{fmtMoney(r.commission, "QAR")}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.viewings}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {activityRows.slice(0, 3).map((r, i) => (
                <Card key={r.id} className="flex items-center gap-3">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", i === 0 ? "bg-pastel-cream" : i === 1 ? "bg-pastel-blue" : "bg-pastel-purple")}>
                    {i === 0 ? <Trophy className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.meaningfulActions} meaningful actions</p>
                  </div>
                </Card>
              ))}
            </div>
            <DataTable
              columns={["Rank", "Agent", "Leads Contacted", "Follow-Ups Completed", "Notes Logged", "Viewings Completed", "Meaningful Actions"]}
              empty={<EmptyState compact title="No data yet" />}
            >
              {activityRows.map((r, i) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3 text-xs font-medium">#{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.contacted}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.followUpsCompleted}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.notesLogged}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.viewingsCompleted}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{r.meaningfulActions}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </PermissionGate>
    </AppShell>
  );
}
