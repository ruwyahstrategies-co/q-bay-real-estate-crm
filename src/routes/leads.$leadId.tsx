import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Phone,
  Mail,
  MessageCircle,
  Pencil,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PipelineStageBadge, IntentScore } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leads/$leadId")({
  head: () => ({
    meta: [{ title: "Lead Profile" }],
  }),
  component: LeadProfilePage,
});

const tabs = [
  "Overview",
  "Conversations",
  "Property Interests",
  "Buyer Intelligence",
  "Files",
  "Tasks",
  "Activity",
] as const;

const intelligenceSections = [
  "AI Summary",
  "Motivations",
  "Objections",
  "Urgency",
  "Budget Signals",
  "Decision Factors",
  "Risks",
  "Recommended Next Action",
  "Suggested Follow-Up",
  "Evidence",
];

function LeadProfilePage() {
  const { leadId } = Route.useParams();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");

  return (
    <AppShell>
      <Link
        to="/leads"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> All leads
      </Link>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pastel-purple text-base font-semibold text-foreground">
              —
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Lead #{leadId}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PipelineStageBadge stage="New Lead" />
                <IntentScore score={null} />
                <span className="text-xs text-muted-foreground">
                  Unassigned agent
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm">
              <Phone className="h-3.5 w-3.5" /> Call
            </Button>
            <Button variant="outline" size="sm">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm">
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>
            <Button variant="outline" size="sm">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              size="sm"
              disabled
              title="Connect AI provider to enable analysis"
            >
              <Sparkles className="h-3.5 w-3.5" /> Analyse Lead
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Buyer Intelligence" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {intelligenceSections.map((s) => (
            <Card key={s}>
              <h4 className="text-sm font-semibold text-foreground">{s}</h4>
              <p className="mt-2 text-xs text-muted-foreground">
                Not analysed yet.
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title={`${tab} — no data yet`}
          description="Information will appear here once captured."
        />
      )}
    </AppShell>
  );
}
