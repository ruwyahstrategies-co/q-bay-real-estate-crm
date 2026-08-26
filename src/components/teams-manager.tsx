import { useState } from "react";
import { Plus, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from "@/hooks/use-teams";
import { useTeamMembers } from "@/hooks/use-team";

const inputCls =
  "h-8 rounded-md border border-border bg-canvas px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

export function TeamsManager() {
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useTeamMembers();
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const del = useDeleteTeam();
  const [newName, setNewName] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name });
      setNewName("");
      toast.success("Team created");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Teams isolate a Team Leader's visibility to their own agents' leads, tasks and viewings. Assign
        members to a team from their profile drawer below.
      </p>
      <div className="mt-3 space-y-2">
        {teams.length === 0 && <p className="text-xs text-muted-foreground">No teams yet.</p>}
        {teams.map((t) => {
          const teamMembers = members.filter((m) => (m as any).team_id === t.id);
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-[11px] text-muted-foreground">({teamMembers.length} member{teamMembers.length === 1 ? "" : "s"})</span>
              <div className="ml-auto flex items-center gap-2">
                <Crown className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  className={inputCls}
                  value={t.leader_id ?? ""}
                  onChange={(e) => update.mutate({ id: t.id, patch: { leader_id: e.target.value || null } })}
                >
                  <option value="">No leader</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <button
                  className="rounded-md p-1.5 text-destructive hover:bg-muted"
                  onClick={async () => {
                    try { await del.mutateAsync(t.id); toast.success("Team deleted"); }
                    catch (e) { toast.error((e as Error).message); }
                  }}
                  aria-label="Delete team"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New team name..."
          className="h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        />
        <Button type="button" size="sm" onClick={handleAdd} disabled={create.isPending}>
          <Plus className="h-3.5 w-3.5" /> Add team
        </Button>
      </div>
    </div>
  );
}
