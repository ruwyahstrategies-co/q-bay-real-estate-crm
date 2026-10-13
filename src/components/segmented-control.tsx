import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label?: ReactNode;
  /** Small count shown after the label, for example a result total. Only pass real numbers. */
  count?: number;
  icon?: ReactNode;
  /** Required when there is no text label (icon-only segments). */
  ariaLabel?: string;
};

/**
 * One-of-N switch used for Sale | Rent, Active | Archived | All and Table | Grid.
 * Keyboard: arrow keys move the selection, Home/End jump to the ends. `tone="green"` is the
 * prominent top-level variant (Sale | Rent); `neutral` is the quiet secondary one.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  tone = "neutral",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
  tone?: "neutral" | "green";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl p-1",
        tone === "green" ? "border border-qbay/15 bg-qbay-tint" : "bg-muted/80",
        className,
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              size === "sm" && "h-7 min-w-7 px-2.5 text-xs",
              size === "md" && "h-8 min-w-8 px-3 text-xs",
              size === "lg" && "h-9 px-5 text-sm",
              selected
                ? tone === "green"
                  ? "bg-qbay text-white shadow-raised"
                  : "bg-canvas text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-4 tabular-nums",
                  selected && tone === "green" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
