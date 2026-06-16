import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

const sections = [
  "Organisation",
  "Team",
  "Lead fields",
  "Pipeline stages",
  "Property fields",
  "Upload settings",
  "AI settings",
  "Notifications",
  "Security",
  "Data retention",
];

function SettingsPage() {
  const [active, setActive] = useState(sections[0]);
  return (
    <AppShell>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Configure your workspace, fields and integrations."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-col gap-0.5 rounded-xl border border-border bg-canvas p-2">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm",
                active === s
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {s}
            </button>
          ))}
        </nav>

        <Card>
          <h3 className="text-base font-semibold">{active}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Configuration for this section will appear here. API keys and
            sensitive credentials are never exposed in the frontend.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
