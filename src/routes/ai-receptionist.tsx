import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui-primitives";

export const Route = createFileRoute("/ai-receptionist")({
  head: () => ({ meta: [{ title: "AI Receptionist" }] }),
  component: AIReceptionistPage,
});

function AIReceptionistPage() {
  return (
    <AppShell>
      <Card className="mx-auto mt-8 max-w-2xl text-center">
        <span className="inline-flex items-center rounded-full bg-pastel-cream px-2.5 py-1 text-[11px] font-medium">
          Separate Module
        </span>
        <div className="mt-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pastel-blue">
            <PhoneCall className="h-6 w-6" />
          </div>
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">
          AI Receptionist — Coming Soon
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          A dedicated voice and call-handling module. It runs separately from
          the buyer intelligence platform and will be available in a future
          release.
        </p>
      </Card>
    </AppShell>
  );
}
