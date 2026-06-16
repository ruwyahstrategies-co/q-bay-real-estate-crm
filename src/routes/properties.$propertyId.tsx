import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/properties/$propertyId")({
  head: () => ({ meta: [{ title: "Property Details" }] }),
  component: PropertyDetailPage,
});

const sections = [
  "Overview",
  "Specifications",
  "Amenities",
  "Media",
  "Brochure & Floor Plan",
  "Assigned Team",
  "Interested Buyers",
];

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  return (
    <AppShell>
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> All properties
      </Link>
      <Card className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">
          Property #{propertyId}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Add property details to populate this page.
        </p>
      </Card>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sections.map((s) => (
          <EmptyState key={s} compact title={s} description="No data yet." />
        ))}
      </div>
    </AppShell>
  );
}
