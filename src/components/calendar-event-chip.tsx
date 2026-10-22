import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import { EVENT_COLOR, EVENT_LABEL, EVENT_TONE, type CalEvent } from "@/lib/calendar-events";

// One calendar entry as a button, with a preview card that opens on hover and on keyboard focus.
// The card stays open while the pointer is over it, so the links inside it can be used.

function RelatedLinks({ e, onNavigate }: { e: CalEvent; onNavigate?: () => void }) {
  const r = e.related;
  if (!r.leadId && !r.propertyId && !r.ownerId) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {r.leadId && (
        <Link
          to="/leads/$leadId"
          params={{ leadId: r.leadId }}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-[11px] text-qbay hover:underline"
        >
          {r.leadName ?? "Lead"} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {r.propertyId && (
        <Link
          to="/properties/$propertyId"
          params={{ propertyId: r.propertyId }}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-[11px] text-qbay hover:underline"
        >
          {r.propertyTitle ?? "Property"} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {r.ownerId && (
        <Link
          to="/owners/$ownerId"
          params={{ ownerId: r.ownerId }}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-[11px] text-qbay hover:underline"
        >
          {r.ownerName ?? "Owner"} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export { RelatedLinks };

/** The small card: what it is, when, who, what it relates to. */
export function EventPreviewCard({ e, id }: { e: CalEvent; id: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      className="w-64 rounded-lg border border-border bg-canvas p-3 text-left shadow-pop"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ background: EVENT_TONE[e.type] }} />
        {EVENT_LABEL[e.type]}
        {e.statusLabel && <span className="ml-auto normal-case tracking-normal">{e.statusLabel}</span>}
      </p>
      <p className={cn("mt-1 text-sm font-medium", e.done && "line-through opacity-70")}>{e.shortLabel}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {e.time ? fmtQatarDateTime(`${e.date}T${e.time}:00+03:00`) : `${e.date}, all day`}
      </p>
      {e.assignedName && <p className="mt-0.5 text-[11px] text-muted-foreground">For {e.assignedName}</p>}
      <RelatedLinks e={e} />
      <p className="mt-2 text-[10px] text-muted-foreground">Select for details, to complete or to reschedule.</p>
    </div>
  );
}

export function EventChip({
  e,
  onOpen,
  align = "left",
  variant = "month",
  onToggleDone,
  dayKey,
}: {
  e: CalEvent;
  onOpen: (e: CalEvent) => void;
  /** Which edge of the chip the preview lines up with, so it stays on screen at the right of the grid. */
  align?: "left" | "right";
  /** "month" is a one line pill; "list" is a row with the time beside it. */
  variant?: "month" | "list";
  /** Shown as a tick box on tasks the person may complete. */
  onToggleDone?: (e: CalEvent) => void;
  dayKey: string;
}) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const previewId = useId();
  const open = hover || focus;

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setHover(false);
        setFocus(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const label = `${EVENT_LABEL[e.type]}: ${e.time ?? "all day"} ${e.shortLabel}${e.done ? ", completed" : ""}${e.cancelled ? ", cancelled" : ""}, ${dayKey}`;

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-start gap-1">
        {onToggleDone && (
          <button
            type="button"
            onClick={() => onToggleDone(e)}
            aria-label={e.done ? `Reopen ${e.shortLabel}` : `Complete ${e.shortLabel}`}
            aria-pressed={e.done}
            title={e.done ? "Reopen" : "Mark complete"}
            className={cn(
              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border",
              e.done ? "bg-qbay text-white" : "bg-canvas hover:bg-muted",
            )}
          >
            {e.done && <Check className="h-3 w-3" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(e)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          aria-label={label}
          aria-describedby={open ? previewId : undefined}
          className={cn(
            "min-w-0 flex-1 rounded-md border-l-2 text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            EVENT_COLOR[e.type],
            variant === "month" ? "block truncate px-1.5 py-0.5 text-[10px]" : "flex items-start gap-2 px-2 py-1.5 text-xs",
            (e.done || e.cancelled) && "opacity-60",
          )}
          style={{ borderLeftColor: EVENT_TONE[e.type] }}
        >
          {variant === "month" ? (
            <span className={cn(e.done && "line-through")}>{e.label}</span>
          ) : (
            <>
              <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{e.time ?? "All day"}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block", e.done && "line-through", e.cancelled && "line-through")}>
                  {e.shortLabel}
                </span>
                <span className="block text-[10px] text-muted-foreground">{EVENT_LABEL[e.type]}</span>
              </span>
            </>
          )}
        </button>
      </div>
      {open && (
        <div className={cn("absolute top-full z-30 pt-1", align === "right" ? "right-0" : "left-0")}>
          <EventPreviewCard e={e} id={previewId} />
        </div>
      )}
    </div>
  );
}
