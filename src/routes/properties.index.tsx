import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Upload, LayoutGrid, Rows3, Building2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterPill } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui-primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/properties/")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const [view, setView] = useState<"table" | "grid">("table");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Inventory"
        title="Properties"
        description="Centralised property inventory for matching with buyer intent."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="h-3.5 w-3.5" /> Upload Properties
            </Button>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" /> Add Property
            </Button>
          </>
        }
      />

      <FilterBar searchPlaceholder="Search by title, reference, location…">
        <FilterPill label="Property type" />
        <FilterPill label="Location" />
        <FilterPill label="Price" />
        <FilterPill label="Availability" />
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
              view === "grid" && "bg-canvas",
            )}
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </FilterBar>

      {view === "table" ? (
        <DataTable
          columns={[
            "Property",
            "Reference",
            "Type",
            "Location",
            "Developer",
            "Price",
            "Beds",
            "Size",
            "Availability",
            "Actions",
          ]}
          empty={
            <EmptyState
              icon={<Building2 className="h-4 w-4" />}
              title="No properties yet"
              description="Add a property or upload property documents to build your inventory."
            />
          }
        />
      ) : (
        <EmptyState
          icon={<Building2 className="h-4 w-4" />}
          title="No properties yet"
          description="Property cards will appear here once you add inventory."
        />
      )}
    </AppShell>
  );
}
