import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "purple" | "green" | "cream";

const toneClass: Record<Tone, string> = {
  blue: "bg-pastel-blue",
  purple: "bg-pastel-purple",
  green: "bg-pastel-green",
  cream: "bg-pastel-cream",
};

export function MetricCard({
  label,
  value,
  icon,
  tone = "blue",
  delta,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** Optional period-comparison line rendered under the value, e.g. "+12% vs previous period". */
  delta?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass-tint relative overflow-hidden rounded-2xl p-5",
        toneClass[tone],
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent"
      />
      <div className="relative flex items-start justify-between">
        <span className="text-[13px] font-medium text-foreground/80">
          {label}
        </span>
        <button
          aria-label="More"
          className="text-foreground/50 hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="relative mt-6 text-[26px] font-semibold tracking-tight text-foreground">
        {value}
      </div>
      {delta ? <p className="relative mt-1 text-[11px] text-foreground/60">{delta}</p> : null}
      {icon ? (
        <div className="relative mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-foreground shadow-sm ring-1 ring-white/60 backdrop-blur">
          {icon}
        </div>
      ) : null}
    </div>
  );
}
