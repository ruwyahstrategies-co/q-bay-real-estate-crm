import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, LayoutGrid, Rows3 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterPill } from "@/components/filter-bar";
import { Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline" }] }),
  component: PipelinePage,
});

const stages = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Property Matching",
  "Viewing Scheduled",
  "Negotiation",
  "Documentation",
  "Won",
  "Lost",
];

function PipelinePage() {
  const [view, setView] = useState<"board" | "list">("board");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Sales"
        title="Pipeline"
        description="Drag-and-drop pipeline across every stage."
        actions={
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" /> Add Lead
          </Button>
        }
      />

      <FilterBar searchPlaceholder="Search leads in pipeline…">
        <FilterPill label="Agent" />
        <FilterPill label="Value" />
        <FilterPill label="Source" />
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              view === "board" && "bg-canvas",
            )}
            onClick={() => setView("board")}
            aria-label="Board view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              view === "list" && "bg-canvas",
            )}
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </FilterBar>

      {view === "board" ? (
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-3">
          {stages.map((stage) => (
            <div
              key={stage}
              className="flex w-[260px] flex-shrink-0 flex-col rounded-xl border border-border bg-background p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">{stage}</span>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted-foreground">
                  0
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-canvas px-3 py-6 text-center text-[11px] text-muted-foreground">
                No leads in this stage
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Total value: —
              </p>
            </div>
          ))}
        </div>
      ) : (
        <DataTable
          columns={[
            "Buyer",
            "Stage",
            "Value",
            "Intent",
            "Assigned",
            "Last update",
          ]}
          empty={
            <EmptyState
              compact
              title="No leads in pipeline yet"
              description="Add leads to start tracking progression."
            />
          }
        />
      )}
    </AppShell>
  );
}
