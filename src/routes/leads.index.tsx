import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Upload, LayoutGrid, Rows3, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterPill } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { AddLeadDrawer } from "@/components/add-lead-drawer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Leads — Buyer Intelligence" },
      {
        name: "description",
        content: "Manage buyer leads, intent and pipeline stages.",
      },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"table" | "cards">("table");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Buyers"
        title="All Leads"
        description="Centralised buyer database with intent, budget and stage."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="h-3.5 w-3.5" /> Import Leads
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Button>
          </>
        }
      />

      <FilterBar searchPlaceholder="Search by name, phone, email…">
        <FilterPill label="Pipeline stage" />
        <FilterPill label="Agent" />
        <FilterPill label="Intent score" />
        <FilterPill label="Source" />
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              view === "table" && "bg-canvas",
            )}
            onClick={() => setView("table")}
            aria-label="Table view"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              view === "cards" && "bg-canvas",
            )}
            onClick={() => setView("cards")}
            aria-label="Card view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </FilterBar>

      <DataTable
        columns={[
          "Buyer",
          "Contact",
          "Budget",
          "Preferred Area",
          "Property Type",
          "Intent Score",
          "Pipeline Stage",
          "Assigned Agent",
          "Last Contact",
          "Actions",
        ]}
        empty={
          <EmptyState
            icon={<Users className="h-4 w-4" />}
            title="No leads yet"
            description="Add a lead manually or import a CSV/XLSX file to get started."
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Upload className="h-3.5 w-3.5" /> Import Leads
                </Button>
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Lead
                </Button>
              </div>
            }
          />
        }
      />

      <AddLeadDrawer open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
