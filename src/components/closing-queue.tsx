import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "./ui-primitives";
import { DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { CloseDealDialog } from "./close-deal-dialog";
import { fmtDate, fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useClosingQueue, type ClosingQueueItem } from "@/hooks/use-closing";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import { propertyCodePrefix } from "@/lib/property-number";

/**
 * Deals waiting to be finalised: leads that have reached Documentation, and leads marked Won that have no
 * closing details yet. Closing records the transaction, the property's availability and the lead's stage in
 * one step. Only people who can finalise deals see this.
 */
export function ClosingQueue() {
  const { data: queue = [], isLoading, isError, error } = useClosingQueue(true);
  const { data: stages = [] } = usePipelineStages();
  const [target, setTarget] = useState<ClosingQueueItem | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Agents can advance a lead up to Documentation. Closing it here records the sale or rental,
        marks the property sold or rented and moves the lead to Won.
      </p>
      {isError ? (
        <EmptyState
          compact
          title="The closing queue could not be loaded"
          description={(error as Error)?.message}
        />
      ) : (
        <DataTable
          columns={["Lead", "Agent", "Stage", "Interested properties", "Waiting since", "Actions"]}
          empty={
            <EmptyState
              icon={<BadgeCheck className="h-4 w-4" />}
              title={isLoading ? "Loading..." : "Nothing is waiting to be closed"}
              description="Leads appear here when an agent moves them to Documentation."
            />
          }
        >
          {queue.map((q) => (
            <tr
              key={q.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-qbay-tint/60"
            >
              <td className="px-4 py-3 text-sm font-medium">{q.full_name}</td>
              <td className="px-4 py-3 text-xs">{q.agent_name ?? "Unassigned"}</td>
              <td className="px-4 py-3 text-xs">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    q.already_won ? "bg-pastel-green" : "bg-muted",
                  )}
                >
                  {stageLabelFrom(stages, q.pipeline_stage)}
                </span>
                {q.already_won && (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    no closing details yet
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {q.properties.length === 0 ? (
                  <span className="text-muted-foreground">None linked</span>
                ) : (
                  <ul className="space-y-0.5">
                    {q.properties.slice(0, 3).map((p) => (
                      <li key={p.property_id}>
                        {propertyCodePrefix(p)}
                        {p.title}
                        {p.price != null ? ` · ${fmtMoney(p.price, p.currency)}` : ""}
                        {p.status === "reserved" ? " (in negotiation)" : ""}
                      </li>
                    ))}
                    {q.properties.length > 3 && (
                      <li className="text-muted-foreground">+{q.properties.length - 3} more</li>
                    )}
                  </ul>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {fmtDate(q.waiting_since)}
              </td>
              <td className="px-4 py-3">
                <Button size="sm" onClick={() => setTarget(q)}>
                  <BadgeCheck className="h-3.5 w-3.5" /> Close deal
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {target && (
        <CloseDealDialog
          open
          onOpenChange={(v) => !v && setTarget(null)}
          lead={{
            id: target.id,
            full_name: target.full_name,
            phone: target.phone,
            email: target.email,
            transaction_intent: target.transaction_intent,
          }}
          initialPropertyId={
            target.properties.find((p) => p.status === "reserved")?.property_id ?? null
          }
          onClosed={() => setTarget(null)}
        />
      )}
    </div>
  );
}
