import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  columns,
  children,
  empty,
  className,
  leadingHeader,
}: {
  columns: string[];
  children?: ReactNode;
  empty?: ReactNode;
  className?: string;
  /** Optional first header cell (for example a select-all checkbox). */
  leadingHeader?: ReactNode;
}) {
  const hasRows = !!children;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-canvas",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background/60">
              {leadingHeader !== undefined && <th className="w-10 px-4 py-3 text-left">{leadingHeader}</th>}
              {columns.map((c) => (
                <th
                  key={c}
                  className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {hasRows ? <tbody>{children}</tbody> : null}
        </table>
      </div>
      {!hasRows ? <div className="p-6">{empty}</div> : null}
    </div>
  );
}
