import { useEffect, useState } from "react";
import { Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { SearchableSelectField, SelectField } from "./select-field";
import { cn } from "@/lib/utils";
import { useTeamMembers } from "@/hooks/use-team";
import { useRequestLeadReassignment } from "@/hooks/use-lead-reassignment";
import {
  DEADLINE_UNITS,
  DEFAULT_DEADLINE,
  REASSIGN_MODES,
  formatMinutes,
  parseDeadline,
  type DeadlineUnit,
  type ReassignMode,
} from "@/lib/reassignment";

type LeadRef = { id: string; full_name: string; assigned_agent_id: string | null };

const PRESETS: { label: string; amount: string; unit: DeadlineUnit }[] = [
  { label: "1 hour", amount: "1", unit: "hours" },
  { label: "4 hours", amount: "4", unit: "hours" },
  { label: "24 hours", amount: "24", unit: "hours" },
  { label: "3 days", amount: "3", unit: "days" },
];

/**
 * The one popup used by every lead reassignment. It asks whether the pipeline starts all over for the new
 * agent or continues from where the previous agent got to, who receives the lead and how long they have to
 * accept. Sending it creates a request: the lead stays with its current agent until the receiving agent
 * accepts, and the database expires the request if the deadline passes.
 */
export function LeadReassignDialog({
  open,
  onOpenChange,
  leads,
  defaultAgentId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: LeadRef[];
  defaultAgentId?: string | null;
  onDone?: () => void;
}) {
  const { data: team = [] } = useTeamMembers();
  const request = useRequestLeadReassignment();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ReassignMode | null>(null);
  const [amount, setAmount] = useState<string>(DEFAULT_DEADLINE.amount);
  const [unit, setUnit] = useState<DeadlineUnit>(DEFAULT_DEADLINE.unit);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setAgentId(defaultAgentId ?? null);
      setMode(null);
      setAmount(DEFAULT_DEADLINE.amount);
      setUnit(DEFAULT_DEADLINE.unit);
      setReason("");
      setTouched(false);
    }
  }, [open, defaultAgentId]);

  const deadline = parseDeadline(amount, unit);
  const receiver = team.find((m) => m.id === agentId);
  const currentAgents = new Set(leads.map((l) => l.assigned_agent_id).filter(Boolean));
  const single = leads.length === 1 ? leads[0] : null;
  const currentName = single?.assigned_agent_id
    ? (team.find((m) => m.id === single.assigned_agent_id)?.full_name ?? "the current agent")
    : "the current agent";

  async function submit() {
    setTouched(true);
    if (!agentId || !mode || deadline.error !== undefined) return;
    try {
      const r = await request.mutateAsync({
        leadIds: leads.map((l) => l.id),
        toAgentId: agentId,
        mode,
        deadlineMinutes: deadline.minutes,
        reason,
      });
      if (r.created > 0) {
        toast.success(
          `${r.created} handover request${r.created === 1 ? "" : "s"} sent to ${receiver?.full_name ?? "the agent"}. ` +
            `They have ${formatMinutes(deadline.minutes)} to accept.`,
        );
      }
      for (const s of r.skipped.slice(0, 3)) {
        const name = leads.find((l) => l.id === s.lead_id)?.full_name ?? "A lead";
        toast.message(`${name}: ${s.reason}`);
      }
      if (r.skipped.length > 3) toast.message(`${r.skipped.length - 3} more were skipped.`);
      if (r.created === 0 && r.skipped.length === 0) toast.error("Nothing was sent.");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(v) => !request.isPending && onOpenChange(v)}
      widthClassName="max-w-lg"
      ariaLabel="Reassign lead"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-qbay-tint text-qbay">
            <UserCog className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold">
              {single ? `Reassign ${single.full_name}` : `Reassign ${leads.length} leads`}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The lead stays with {single ? currentName : "its current agents"} until the new agent
              accepts.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Receiving agent
            </span>
            <SearchableSelectField
              value={agentId}
              onChange={setAgentId}
              options={team
                .filter(
                  (m) =>
                    m.is_active !== false && !(currentAgents.size === 1 && currentAgents.has(m.id)),
                )
                .map((m) => ({ value: m.id, label: m.full_name }))}
              placeholder="Search and select an agent"
              searchPlaceholder="Search agents..."
              allowClear={false}
            />
            {touched && !agentId && (
              <span className="text-[11px] text-destructive">Choose who receives the lead.</span>
            )}
          </label>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              What happens to the pipeline?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REASSIGN_MODES.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                    mode === m.value
                      ? "border-qbay bg-qbay-tint ring-2 ring-qbay/15"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name="reassign-mode"
                      className="accent-[var(--qbay-green)]"
                      checked={mode === m.value}
                      onChange={() => setMode(m.value)}
                    />
                    {m.title}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {m.description}
                  </span>
                </label>
              ))}
            </div>
            {touched && !mode && (
              <span className="mt-1 block text-[11px] text-destructive">
                Choose one of the two options.
              </span>
            )}
          </fieldset>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Time to accept
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                inputMode="numeric"
                aria-label="Acceptance deadline amount"
                className="h-9 w-20 rounded-lg border border-border bg-canvas px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/20"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <SelectField
                value={unit}
                onChange={(v) => setUnit((v ?? "hours") as DeadlineUnit)}
                options={DEADLINE_UNITS}
                allowClear={false}
                className="h-9 w-32"
                aria-label="Acceptance deadline unit"
              />
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                      amount === p.amount && unit === p.unit
                        ? "border-qbay bg-qbay-tint text-qbay"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => {
                      setAmount(p.amount);
                      setUnit(p.unit);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {deadline.error !== undefined ? (
              <span className="mt-1 block text-[11px] text-destructive">{deadline.error}</span>
            ) : (
              <span className="mt-1 block text-[11px] text-muted-foreground">
                If there is no answer in {formatMinutes(deadline.minutes)}, the request expires and
                the lead stays where it is.
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </span>
            <input
              className="h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: covering leave"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={request.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={request.isPending}>
            {request.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send request
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
