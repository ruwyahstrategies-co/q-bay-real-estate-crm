import { createFileRoute } from "@tanstack/react-router";
import { Plus, Upload, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterPill } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { Button, Card } from "@/components/ui-primitives";

export const Route = createFileRoute("/conversations")({
  head: () => ({ meta: [{ title: "Conversations" }] }),
  component: ConversationsPage,
});

const sources = [
  "WhatsApp",
  "Phone call",
  "Email",
  "Meeting",
  "Website enquiry",
  "Walk-in",
  "Manual note",
];

function ConversationsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Interactions"
        title="Conversations"
        description="Store and review every buyer interaction across all channels."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="h-3.5 w-3.5" /> Upload conversation
            </Button>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" /> Add interaction
            </Button>
          </>
        }
      />

      <FilterBar searchPlaceholder="Search interactions…">
        <FilterPill label="Source" />
        <FilterPill label="Agent" />
        <FilterPill label="Lead" />
        <FilterPill label="Date" />
      </FilterBar>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_320px]">
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            All interactions
          </div>
          <EmptyState
            compact
            className="border-0"
            icon={<MessageCircle className="h-4 w-4" />}
            title="No conversations"
            description="Logged interactions will appear here."
          />
        </Card>
        <Card className="flex min-h-[420px] items-center justify-center text-center">
          <div>
            <p className="text-sm font-semibold">Select a conversation</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supported types: {sources.join(", ")}.
            </p>
          </div>
        </Card>
        <Card>
          <h4 className="text-sm font-semibold">Buyer context</h4>
          <p className="mt-2 text-xs text-muted-foreground">
            Lead details, intent and recent activity will appear here.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
