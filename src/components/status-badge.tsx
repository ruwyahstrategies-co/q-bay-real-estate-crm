import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "neutral"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "purple"
  | "teal"
  | "orange"
  | "slate"
  | "indigo";

const variants: Record<Variant, string> = {
  neutral: "bg-muted text-foreground",
  blue: "bg-pastel-blue text-foreground",
  green: "bg-pastel-green text-foreground",
  amber: "bg-pastel-cream text-foreground",
  red: "bg-[#FADCDA] text-foreground",
  purple: "bg-pastel-purple text-foreground",
  teal: "bg-pastel-teal text-foreground",
  orange: "bg-pastel-orange text-foreground",
  slate: "bg-pastel-slate text-foreground",
  indigo: "bg-pastel-indigo text-foreground",
};

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PipelineStageBadge({ stage }: { stage: string }) {
  const map: Record<string, Variant> = {
    "New Lead": "blue",
    Contacted: "purple",
    Qualified: "teal",
    "Property Matching": "slate",
    "Viewing Scheduled": "amber",
    Negotiation: "orange",
    Documentation: "indigo",
    Won: "green",
    Lost: "red",
  };
  return <StatusBadge variant={map[stage] ?? "neutral"}>{stage}</StatusBadge>;
}

const AVAILABILITY_RING: Record<string, { dot: string; label: string }> = {
  available: { dot: "bg-qbay", label: "Available" },
  reserved: { dot: "bg-amber-500", label: "Reserved" },
  sold: { dot: "bg-slate-500", label: "Sold" },
  rented: { dot: "bg-blue-500", label: "Rented" },
  unavailable: { dot: "bg-red-500", label: "Unavailable" },
  needs_confirmation: { dot: "bg-purple-500", label: "Needs Confirmation" },
};

/**
 * Compact presence-style availability indicator - a colored ring never
 * carries meaning alone, so the label always renders alongside it (title
 * attribute + visible text), matching the accessibility requirement.
 */
export function AvailabilityRing({
  availability,
  needsConfirmation,
  className,
  labelClassName,
}: {
  availability: string | null | undefined;
  /** True when the property's availability confirmation is overdue - takes visual precedence over the stored availability value without changing it. */
  needsConfirmation?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const key = needsConfirmation ? "needs_confirmation" : (availability ?? "available");
  const info = AVAILABILITY_RING[key] ?? AVAILABILITY_RING.available;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={info.label}>
      <span
        className={cn(
          "inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-canvas",
          info.dot,
        )}
        aria-hidden="true"
      />
      <span className={cn("text-xs text-foreground", labelClassName)}>{info.label}</span>
    </span>
  );
}

export function IntentScore({ score }: { score?: number | null }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  let variant: Variant = "neutral";
  if (score >= 75) variant = "green";
  else if (score >= 50) variant = "amber";
  else variant = "red";
  return <StatusBadge variant={variant}>{score}</StatusBadge>;
}
