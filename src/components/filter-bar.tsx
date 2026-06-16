import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterBar({
  searchPlaceholder = "Search…",
  children,
  className,
}: {
  searchPlaceholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2",
        className,
      )}
    >
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-lg bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {children}
    </div>
  );
}

export function FilterPill({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-canvas px-3 text-xs font-medium text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );
}
