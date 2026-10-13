import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared row styling so every table hovers and focuses the same way. */
export const dataRowCls =
  "border-b border-border last:border-0 transition-colors hover:bg-qbay-tint/60";

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
        "overflow-hidden rounded-xl border border-border bg-canvas shadow-card",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {leadingHeader !== undefined && (
                <th className="w-10 px-4 py-2.5 text-left">{leadingHeader}</th>
              )}
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
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
