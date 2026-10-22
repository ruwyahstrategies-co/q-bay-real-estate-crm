import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";
import { RelatedLinks } from "./calendar-event-chip";
import { usePermissions } from "@/hooks/use-auth";
import { useUpdateTask } from "@/hooks/use-tasks";
import { useCompleteViewing, useRescheduleViewing } from "@/hooks/use-viewings";
import { fmtMoney, type Task } from "@/lib/db";
import { fromQatarInputValue, toQatarInputValue } from "@/lib/qatar-time";
import {
  EVENT_LABEL,
  completionPatch,
  isTaskDone,
  type CalEvent,
} from "@/lib/calendar-events";
import { titleCase } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

/**
 * The details of one calendar entry, with the things you do to it: complete or reopen a task, complete a
 * viewing, move either to a new time, open the full record, and jump to the lead, property or owner it is about.
 * Every change is made on the task or viewing itself, so the Tasks and Viewings pages show it at once.
 */
export function CalendarEventDialog({
  event,
  onClose,
  onEditTask,
  onOpenViewing,
  onOpenLease,
}: {
  event: CalEvent | null;
  onClose: () => void;
  onEditTask: (task: Task) => void;
  onOpenViewing: (viewingId: string) => void;
  onOpenLease: (leaseId: string) => void;
}) {
  const { can } = usePermissions();
  const updateTask = useUpdateTask();
  const reschedule = useRescheduleViewing();
  const completeViewing = useCompleteViewing();
  const [whenLocal, setWhenLocal] = useState("");

  useEffect(() => {
    if (!event) return;
    if (event.type === "viewing") setWhenLocal(toQatarInputValue(event.scheduledAt));
    else if (event.type === "task" || event.type === "event" || event.type === "reminder") {
      setWhenLocal(toQatarInputValue(event.task.due_at));
    } else setWhenLocal("");
    // Reset only when a different entry is opened, not each time the lists refresh underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.key]);

  if (!event) return null;

  const isTaskLike = event.type === "task" || event.type === "event" || event.type === "reminder";
  const busy = updateTask.isPending || reschedule.isPending || completeViewing.isPending;

  async function toggleTask(task: Task) {
    try {
      await updateTask.mutateAsync({ id: task.id, patch: completionPatch(!isTaskDone(task.status), new Date().toISOString()) });
      toast.success(isTaskDone(task.status) ? "Reopened" : "Marked complete");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveTask(task: Task) {
    const iso = fromQatarInputValue(whenLocal);
    if (!iso) return toast.error("Choose a valid date and time.");
    try {
      await updateTask.mutateAsync({ id: task.id, patch: { due_at: iso } });
      toast.success("Rescheduled");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveViewing(id: string) {
    const iso = fromQatarInputValue(whenLocal);
    if (!iso) return toast.error("Choose a valid date and time.");
    try {
      await reschedule.mutateAsync({ id, scheduledAt: iso });
      toast.success("Viewing rescheduled");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function finishViewing(id: string) {
    try {
      await completeViewing.mutateAsync({ id });
      toast.success("Viewing marked complete");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rescheduleRow = (onSave: () => void) => (
    <div className="mt-4 rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reschedule (Qatar time)</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          className={`${inputCls} flex-1`}
          value={whenLocal}
          onChange={(e) => setWhenLocal(e.target.value)}
          aria-label="New date and time"
        />
        <Button size="sm" variant="outline" onClick={onSave} disabled={busy || !whenLocal}>
          Move
        </Button>
      </div>
    </div>
  );

  return (
    <DialogShell open onOpenChange={(v) => !v && onClose()} widthClassName="max-w-md" ariaLabel="Calendar entry">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {EVENT_LABEL[event.type]}
              {event.statusLabel ? ` · ${event.statusLabel}` : ""}
            </p>
            <h3 className="mt-0.5 text-base font-semibold">{event.shortLabel}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isTaskLike && (
          <>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Due</dt>
              <dd>{event.time ? `${event.date} ${event.time}` : event.date}</dd>
              <dt className="text-muted-foreground">Priority</dt>
              <dd>{titleCase(event.task.priority ?? "medium")}</dd>
              {event.assignedName && (
                <>
                  <dt className="text-muted-foreground">Assigned to</dt>
                  <dd>{event.assignedName}</dd>
                </>
              )}
              {event.task.description && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">{event.task.description}</dd>
                </>
              )}
            </dl>
            <RelatedLinks e={event} onNavigate={onClose} />
            {can("tasks", "edit") && !event.cancelled && rescheduleRow(() => moveTask(event.task))}
            <div className="mt-4 flex flex-wrap gap-2">
              {can("tasks", "complete") && !event.cancelled && (
                <Button size="sm" onClick={() => toggleTask(event.task)} disabled={busy}>
                  {event.done ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {event.done ? "Reopen" : "Mark complete"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onEditTask(event.task);
                  onClose();
                }}
              >
                Open full task
              </Button>
            </div>
          </>
        )}

        {event.type === "viewing" && (
          <>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">When</dt>
              <dd>{event.time ? `${event.date} ${event.time}` : event.date}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{titleCase(event.viewingStatus)}</dd>
              {event.assignedName && (
                <>
                  <dt className="text-muted-foreground">Agent</dt>
                  <dd>{event.assignedName}</dd>
                </>
              )}
            </dl>
            <RelatedLinks e={event} onNavigate={onClose} />
            {event.canReschedule && can("viewings", "edit") && rescheduleRow(() => moveViewing(event.viewingId))}
            <div className="mt-4 flex flex-wrap gap-2">
              {can("viewings", "complete") && (event.viewingStatus === "scheduled" || event.viewingStatus === "confirmed") && (
                <Button size="sm" onClick={() => finishViewing(event.viewingId)} disabled={busy}>
                  <Check className="h-3.5 w-3.5" /> Mark complete
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenViewing(event.viewingId);
                  onClose();
                }}
              >
                Open full viewing
              </Button>
            </div>
          </>
        )}

        {event.type === "contract" && (
          <>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{event.ownerName}</dd>
              <dt className="text-muted-foreground">Property</dt>
              <dd>{event.propertyTitle ?? "-"}</dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{event.expiry}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/owners/$ownerId" params={{ ownerId: event.ownerId }} onClick={onClose}>
                <Button size="sm">Open owner and contract</Button>
              </Link>
              {event.propertyId && (
                <Link to="/properties/$propertyId" params={{ propertyId: event.propertyId }} onClick={onClose}>
                  <Button size="sm" variant="outline">
                    Open property
                  </Button>
                </Link>
              )}
            </div>
          </>
        )}

        {event.type === "tenancy" && (
          <>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Tenant</dt>
              <dd>{event.tenant}</dd>
              <dt className="text-muted-foreground">Property</dt>
              <dd>{event.propertyTitle ?? "-"}</dd>
              <dt className="text-muted-foreground">Lease</dt>
              <dd>
                {event.start ?? "?"} to {event.end}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{titleCase(event.status)}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onOpenLease(event.leaseId);
                  onClose();
                }}
              >
                Open tenancy
              </Button>
              <Link to="/properties/$propertyId" params={{ propertyId: event.propertyId }} onClick={onClose}>
                <Button size="sm" variant="outline">
                  Open property
                </Button>
              </Link>
            </div>
          </>
        )}

        {event.type === "rent" && (
          <>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Property</dt>
              <dd>{event.propertyTitle ?? "-"}</dd>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular-nums">{fmtMoney(event.amount, event.currency)}</dd>
              <dt className="text-muted-foreground">Due</dt>
              <dd>{event.due}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{titleCase(event.status)}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onOpenLease(event.leaseId);
                  onClose();
                }}
              >
                Open tenancy
              </Button>
              {event.propertyId && (
                <Link to="/properties/$propertyId" params={{ propertyId: event.propertyId }} onClick={onClose}>
                  <Button size="sm" variant="outline">
                    Open property
                  </Button>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
