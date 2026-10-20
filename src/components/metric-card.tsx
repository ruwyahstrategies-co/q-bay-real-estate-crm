import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "purple" | "green" | "cream";

const chipClass: Record<Tone, string> = {
  blue: "bg-pastel-blue",
  purple: "bg-pastel-purple",
  green: "bg-pastel-green",
  cream: "bg-pastel-cream",
};

/**
 * Compact KPI tile: icon chip + label, big number, optional comparison line. White card on the
 * tinted workspace; the tone only colours the small icon chip so a row of tiles stays calm.
 */
export function MetricCard({
  label,
  value,
  icon,
  tone = "green",
  delta,
  title,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** Optional period-comparison line rendered under the value, e.g. "+12% vs previous period". */
  delta?: ReactNode;
  /** The full, exact value, shown on hover when the displayed value is shortened. */
  title?: string;
  className?: string;
}) {
  return (
    // min-w-0 + overflow-hidden: a long figure can never push the card wider or spill out of it.
    <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-canvas p-4 shadow-card", className)}>
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-foreground [&>svg]:h-4 [&>svg]:w-4",
              chipClass[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div
        title={title}
        className="mt-3 min-w-0 text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-foreground [overflow-wrap:anywhere] sm:text-[26px]"
      >
        {value}
      </div>
      {delta ? <p className="mt-1.5 text-xs text-muted-foreground">{delta}</p> : null}
    </div>
  );
}
