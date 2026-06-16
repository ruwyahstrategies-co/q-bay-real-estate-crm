import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Team" }] }),
  component: TeamPage,
});

const metrics = [
  "Assigned leads",
  "Follow-ups due",
  "Pipeline value",
  "Conversion rate",
  "Response time",
  "Closed deals",
];

function TeamPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="People"
        title="Team"
        description="Manage agents and review performance."
        actions={
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" /> Invite member
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <Card key={m} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {m}
            </p>
            <p className="mt-3 text-xl font-semibold">—</p>
          </Card>
        ))}
      </div>

      <DataTable
        columns={[
          "Member",
          "Role",
          "Assigned leads",
          "Follow-ups due",
          "Pipeline value",
          "Closed deals",
          "Actions",
        ]}
        empty={
          <EmptyState
            icon={<UserCog className="h-4 w-4" />}
            title="No team members yet"
            description="Invite agents to start assigning leads."
          />
        }
      />
    </AppShell>
  );
}
