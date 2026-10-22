import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { DrawerShell } from "./overlay";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";

// The Filters button, drawer and active-filter chips shared by Leads and Properties.
//
// The drawer holds every filter. Filters apply as soon as they are changed, because each one is sent to the
// database as part of the list query (nothing is filtered in the browser), and the footer shows the live
// result count. Search stays in the toolbar so it is always one click away.

export function FiltersButton({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted",
        count > 0 ? "border-qbay/40 bg-qbay-tint text-qbay" : "border-border bg-canvas",
        className,
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      Filters
      {count > 0 && (
        <span className="rounded-full bg-qbay px-1.5 text-[10px] leading-4 tabular-nums text-white">
          {count}
        </span>
      )}
    </button>
  );
}

/** A labelled control inside the drawer. */
export function FilterField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** A group heading inside the drawer. */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border pb-4 last:border-b-0">
      <h4 className="text-xs font-semibold uppercase tracking-wide">{title}</h4>
      {children}
    </section>
  );
}

export function FiltersDrawer({
  open,
  onOpenChange,
  title,
  activeCount,
  resultText,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  activeCount: number;
  /** For example "37 leads match". */
  resultText: string;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="max-w-md"
      ariaLabel={title}
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClear} disabled={activeCount === 0}>
            Clear all{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {resultText}
          </Button>
        </div>
      </div>
    </DrawerShell>
  );
}

export type FilterChip = { key: string; label: string; onRemove: () => void };

/** The filters that are on, as removable pills under the toolbar. */
export function ActiveFilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-qbay/30 bg-qbay-tint py-0.5 pl-2.5 pr-1 text-[11px] text-qbay"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-qbay/15"
            aria-label={`Remove filter ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
