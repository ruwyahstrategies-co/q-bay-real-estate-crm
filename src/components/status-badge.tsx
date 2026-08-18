import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "neutral" | "blue" | "green" | "amber" | "red" | "purple";

const variants: Record<Variant, string> = {
  neutral: "bg-muted text-foreground",
  blue: "bg-pastel-blue text-foreground",
  green: "bg-pastel-green text-foreground",
  amber: "bg-pastel-cream text-foreground",
  red: "bg-[#FADCDA] text-foreground",
  purple: "bg-pastel-purple text-foreground",
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
    Qualified: "green",
    "Property Matching": "blue",
    "Viewing Scheduled": "amber",
    Negotiation: "amber",
    Documentation: "purple",
    Won: "green",
    Lost: "red",
  };
  return <StatusBadge variant={map[stage] ?? "neutral"}>{stage}</StatusBadge>;
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
