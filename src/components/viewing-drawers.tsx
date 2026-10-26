import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck2, CalendarClock, CheckCircle2, ClipboardList, ExternalLink, MapPin, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SearchableSelectField } from "./select-field";
import { LeadSearchSelect } from "./lead-picker";
import { PropertySearchSelect } from "./property-picker";
import { TaskDrawer } from "./task-drawer";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useLeadBrief } from "@/hooks/use-lead-picker";
import {
  useCancelViewing,
  useCompleteViewing,
  useConfirmViewing,
  useRescheduleViewing,
  useScheduleViewing,
  useViewing,
  useViewingEvents,
} from "@/hooks/use-viewings";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { fmtQatarDateTime, fromQatarInputValue, toQatarInputValue } from "@/lib/qatar-time";
import { cn, titleCase } from "@/lib/utils";
import { propertyCodePrefix } from "@/lib/property-number";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-pastel-blue",
  confirmed: "bg-pastel-purple",
  completed: "bg-pastel-green",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-[#FADCDA]",
};

export function ViewingStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", STATUS_COLORS[status] ?? "bg-muted")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schedule                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Book a viewing: which lead, which property, which agent, when. Saving creates ONE viewing that every screen
 * shows, and moves the lead to Viewing Scheduled if it has not already gone further.
 */
export function ScheduleViewingDrawer({
  open,
  onOpenChange,
  defaultLeadId,
  defaultPropertyId,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When set, the lead is fixed (opened from a lead profile). */
  defaultLeadId?: string | null;
  /** When set, the property is fixed (opened from a property profile). */
  defaultPropertyId?: string | null;
  onScheduled?: (viewingId: string) => void;
}) {
  const schedule = useScheduleViewing();
  const { data: team = [] } = useTeamMembers();
  const { teamMember: me } = useCurrentUser();
  const { data: stages = [] } = usePipelineStages();

  const [leadId, setLeadId] = useState<string | null>(defaultLeadId ?? null);
  const [propertyId, setPropertyId] = useState<string | null>(defaultPropertyId ?? null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentTouched, setAgentTouched] = useState(false);
  const [whenLocal, setWhenLocal] = useState("");
  const [notes, setNotes] = useState("");
  const { data: lead } = useLeadBrief(leadId);

  useEffect(() => {
    if (!open) return;
    setLeadId(defaultLeadId ?? null);
    setPropertyId(defaultPropertyId ?? null);
    setAgentId(null);
    setAgentTouched(false);
    setWhenLocal("");
    setNotes("");
  }, [open, defaultLeadId, defaultPropertyId]);

  // Default the agent to the lead's own agent, then to the person booking, until they pick someone.
  useEffect(() => {
    if (agentTouched) return;
    setAgentId(lead?.assigned_agent_id ?? me?.id ?? null);
  }, [lead?.assigned_agent_id, me?.id, agentTouched]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (schedule.isPending) return;
    const iso = fromQatarInputValue(whenLocal);
    if (!leadId) return toast.error("Choose the lead for this viewing");
    if (!propertyId) return toast.error("Choose the property to be viewed");
    if (!iso) return toast.error("Choose a date and time");
    try {
      const r = await schedule.mutateAsync({ leadId, propertyId, scheduledAt: iso, agentId, notes });
      if (r.duplicate) {
        toast.info("This viewing was already scheduled. No duplicate was created.");
      } else if (r.stage_advanced) {
        toast.success(`Viewing scheduled. The lead moved to ${stageLabelFrom(stages, r.new_stage ?? "viewing_scheduled")}.`);
      } else {
        toast.success(
          `Viewing scheduled. The lead stays at ${stageLabelFrom(stages, r.new_stage ?? lead?.pipeline_stage ?? "")} because it is already at or past that point.`,
        );
      }
      onScheduled?.(r.viewing_id);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Schedule a viewing" widthClassName="max-w-lg">
      <DrawerHeader title="Schedule a viewing" onClose={() => onOpenChange(false)} />
      <form className="grid flex-1 grid-cols-1 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-2" onSubmit={submit}>
        <Field label="Lead *" full>
          {defaultLeadId ? (
            <p className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm">{lead?.full_name ?? "Loading..."}</p>
          ) : (
            <LeadSearchSelect value={leadId} onChange={setLeadId} allowClear={false} />
          )}
        </Field>
        <Field label="Property *" full>
          <PropertySearchSelect value={propertyId} onChange={setPropertyId} disabled={!!defaultPropertyId} />
          {!defaultPropertyId && <span className="text-[11px] text-muted-foreground">The property the client is going to see.</span>}
        </Field>
        <Field label="Date and time (Qatar) *">
          <input className={inputCls} type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} required />
        </Field>
        <Field label="Agent">
          <SearchableSelectField
            value={agentId}
            onChange={(v) => {
              setAgentTouched(true);
              setAgentId(v);
            }}
            options={team.filter((m) => m.is_active !== false).map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select agent"
            searchPlaceholder="Search agents..."
            allowClear={false}
          />
        </Field>
        <Field label="Notes" full>
          <textarea className={cn(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Meeting point, access instructions, anything the agent needs" />
        </Field>
        <p className="sm:col-span-2 text-[11px] text-muted-foreground">
          Saving moves the lead to Viewing Scheduled unless it is already further along. Leads never move backward.
        </p>
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-border bg-canvas/95 px-5 py-3 backdrop-blur sm:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={schedule.isPending}>
            {schedule.isPending ? "Scheduling..." : "Schedule viewing"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail: confirm, reschedule, cancel, complete, history                      */
/* -------------------------------------------------------------------------- */

type Mode = "view" | "reschedule" | "cancel" | "complete";

const EVENT_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  rescheduled: "Rescheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Marked no-show",
  reassigned: "Agent changed",
  property_changed: "Property changed",
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("Location is not available on this device"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

export function ViewingDetailDrawer({
  viewingId,
  open,
  onOpenChange,
}: {
  viewingId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { can } = usePermissions();
  const { data: viewing, isLoading } = useViewing(viewingId);
  const { data: events = [] } = useViewingEvents(viewingId);
  const { data: team = [] } = useTeamMembers();
  const confirmV = useConfirmViewing();
  const reschedule = useRescheduleViewing();
  const cancel = useCancelViewing();
  const complete = useCompleteViewing();

  const [mode, setMode] = useState<Mode>("view");
  const [whenLocal, setWhenLocal] = useState("");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [attachLocation, setAttachLocation] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("view");
    setNote("");
    setAttachLocation(false);
  }, [open, viewingId]);

  useEffect(() => {
    if (!viewing) return;
    setWhenLocal(toQatarInputValue(viewing.scheduled_at));
    setPropertyId(viewing.property_id);
    setAgentId(viewing.assigned_agent_id);
    // Re-read the stored values whenever they change or the reschedule form is (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id, viewing?.scheduled_at, viewing?.property_id, viewing?.assigned_agent_id, mode]);

  const agentName = (id: string | null) => team.find((m) => m.id === id)?.full_name ?? "Unassigned";
  const canEdit = can("viewings", "edit");
  const canComplete = can("viewings", "complete");
  const open_ = viewing && (viewing.status === "scheduled" || viewing.status === "confirmed");
  const busy = confirmV.isPending || reschedule.isPending || cancel.isPending || complete.isPending;

  async function run(fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    try {
      await fn();
      toast.success(success);
      setMode("view");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Viewing details" widthClassName="max-w-lg">
      <DrawerHeader title="Viewing" onClose={() => onOpenChange(false)} />
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !viewing ? (
          <p className="text-sm text-muted-foreground">This viewing could not be found, or you do not have access to it.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tabular-nums">{fmtQatarDateTime(viewing.scheduled_at)}</p>
                <p className="text-[11px] text-muted-foreground">Qatar time{viewing.reschedule_count ? ` · rescheduled ${viewing.reschedule_count}x` : ""}</p>
              </div>
              <ViewingStatusBadge status={viewing.status} />
            </div>

            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Lead</dt>
              <dd>
                {viewing.lead_id ? (
                  <Link to="/leads/$leadId" params={{ leadId: viewing.lead_id }} className="inline-flex items-center gap-1 text-qbay hover:underline" onClick={() => onOpenChange(false)}>
                    {viewing.leads?.full_name ?? "Lead"} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  "-"
                )}
              </dd>
              <dt className="text-muted-foreground">Property</dt>
              <dd>
                {viewing.property_id ? (
                  <Link to="/properties/$propertyId" params={{ propertyId: viewing.property_id }} className="inline-flex items-center gap-1 text-qbay hover:underline" onClick={() => onOpenChange(false)}>
                    {propertyCodePrefix(viewing.properties)}
                    {viewing.properties?.title ?? "Property"} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No property linked. Reschedule to attach one.</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Agent</dt>
              <dd>{agentName(viewing.assigned_agent_id)}</dd>
              {viewing.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">{viewing.notes}</dd>
                </>
              )}
              {viewing.status === "cancelled" && viewing.cancellation_reason && (
                <>
                  <dt className="text-muted-foreground">Cancelled because</dt>
                  <dd>{viewing.cancellation_reason}</dd>
                </>
              )}
              {viewing.latitude != null && viewing.longitude != null && (
                <>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd className="inline-flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {viewing.latitude.toFixed(4)}, {viewing.longitude.toFixed(4)}
                  </dd>
                </>
              )}
            </dl>

            {mode === "view" && (
              <div className="flex flex-wrap gap-2">
                {canEdit && viewing.status === "scheduled" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => confirmV.mutateAsync(viewing.id), "Viewing confirmed")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                  </Button>
                )}
                {canEdit && viewing.status !== "completed" && (
                  <Button size="sm" variant="outline" onClick={() => setMode("reschedule")}>
                    <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                  </Button>
                )}
                {canComplete && open_ && (
                  <Button size="sm" onClick={() => setMode("complete")}>
                    <CalendarCheck2 className="h-3.5 w-3.5" /> Mark completed
                  </Button>
                )}
                {canEdit && open_ && (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setMode("cancel")}>
                    <XCircle className="h-3.5 w-3.5" /> Cancel viewing
                  </Button>
                )}
                {can("tasks", "create") && (
                  <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                    <ClipboardList className="h-3.5 w-3.5" /> Add task
                  </Button>
                )}
              </div>
            )}

            {mode === "reschedule" && (
              <form
                className="space-y-3 rounded-xl border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const iso = fromQatarInputValue(whenLocal);
                  if (!iso) return toast.error("Choose the new date and time");
                  void run(async () => {
                    const r = await reschedule.mutateAsync({ id: viewing.id, scheduledAt: iso, propertyId, agentId, note });
                    if (r.unchanged) throw new Error("Nothing was changed");
                  }, "Viewing rescheduled");
                }}
              >
                <p className="text-sm font-medium">Reschedule this viewing</p>
                <p className="text-[11px] text-muted-foreground">The same viewing is updated. It keeps its lead, property and history.</p>
                <Field label="New date and time (Qatar)">
                  <input className={inputCls} type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} required />
                </Field>
                <Field label="Property">
                  <PropertySearchSelect value={propertyId} onChange={setPropertyId} />
                </Field>
                <Field label="Agent">
                  <SearchableSelectField
                    value={agentId}
                    onChange={setAgentId}
                    options={team.filter((m) => m.is_active !== false || m.id === viewing.assigned_agent_id).map((m) => ({ value: m.id, label: m.full_name }))}
                    placeholder="Select agent"
                    searchPlaceholder="Search agents..."
                    allowClear={false}
                  />
                </Field>
                <Field label="Reason (optional)">
                  <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="For example: client asked to move it" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setMode("view")} disabled={busy}>
                    Back
                  </Button>
                  <Button type="submit" size="sm" disabled={busy}>
                    {reschedule.isPending ? "Saving..." : "Save new time"}
                  </Button>
                </div>
              </form>
            )}

            {mode === "cancel" && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium">Cancel this viewing?</p>
                <p className="text-[11px] text-muted-foreground">
                  The appointment is marked cancelled and kept in the history. The lead stays at its current pipeline stage.
                </p>
                <Field label="Reason (optional)">
                  <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="For example: client no longer interested in this unit" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMode("view")} disabled={busy}>
                    Keep viewing
                  </Button>
                  <Button
                    size="sm"
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={busy}
                    onClick={() => run(() => cancel.mutateAsync({ id: viewing.id, reason: note }), "Viewing cancelled")}
                  >
                    {cancel.isPending ? "Cancelling..." : "Cancel viewing"}
                  </Button>
                </div>
              </div>
            )}

            {mode === "complete" && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-medium">Mark this viewing completed</p>
                <Field label="Notes from the viewing (optional)">
                  <textarea className={cn(inputCls, "h-20 py-2")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Client feedback, next steps" />
                </Field>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={attachLocation} onChange={(e) => setAttachLocation(e.target.checked)} />
                  Attach my current device location as completion evidence
                </label>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMode("view")} disabled={busy}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        let coords: { latitude?: number; longitude?: number } = {};
                        if (attachLocation) {
                          try {
                            const pos = await getPosition();
                            coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                          } catch {
                            toast.warning("Location could not be read, so the viewing was completed without it.");
                          }
                        }
                        await complete.mutateAsync({ id: viewing.id, notes: note, ...coords });
                      }, "Viewing marked completed")
                    }
                  >
                    {complete.isPending ? "Saving..." : "Mark completed"}
                  </Button>
                </div>
              </div>
            )}

            <section aria-label="Viewing history">
              <h4 className="text-sm font-semibold">History</h4>
              {events.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No history recorded yet.</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {events.map((ev) => (
                    <li key={ev.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{EVENT_LABELS[ev.action] ?? titleCase(ev.action)}</span>
                        <span className="text-muted-foreground tabular-nums">{fmtQatarDateTime(ev.created_at)}</span>
                      </div>
                      {ev.action === "rescheduled" && ev.from_scheduled_at && ev.to_scheduled_at && (
                        <p className="mt-0.5 text-muted-foreground">
                          {fmtQatarDateTime(ev.from_scheduled_at)} to {fmtQatarDateTime(ev.to_scheduled_at)}
                        </p>
                      )}
                      {ev.note && <p className="mt-0.5 text-muted-foreground">{ev.note}</p>}
                      <p className="mt-0.5 text-muted-foreground">by {agentName(ev.actor_team_member_id)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>

    </DrawerShell>
    {/* A sibling, not a child: the drawer panel is transformed, which would trap a nested fixed overlay. */}
    {viewing && (
      <TaskDrawer
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultLeadId={viewing.lead_id}
        defaultPropertyId={viewing.property_id}
        defaultTitle={`Follow up on viewing${viewing.leads?.full_name ? `: ${viewing.leads.full_name}` : ""}`}
        source="viewing"
        sourceRef={viewing.id}
      />
    )}
    </>
  );
}
