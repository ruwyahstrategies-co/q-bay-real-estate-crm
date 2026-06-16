import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { cn } from "@/lib/utils";
import { sb, PIPELINE_STAGES } from "@/lib/db";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

const sections = [
  "Organisation",
  "Pipeline stages",
  "Lead fields",
  "Property fields",
  "Upload settings",
  "AI settings",
  "Notifications",
  "Security",
  "Data retention",
];

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function SettingsPage() {
  const [active, setActive] = useState(sections[0]);
  const [currency, setCurrency] = useState("QAR");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("app_settings").select("setting_value").eq("setting_key", "default_currency").maybeSingle();
      const v = (data?.setting_value as { value?: string } | null)?.value;
      if (v) setCurrency(v);
    })();
  }, []);

  async function saveCurrency() {
    setSaving(true);
    const { error } = await sb
      .from("app_settings")
      .upsert({ setting_key: "default_currency", setting_value: { value: currency } }, { onConflict: "setting_key" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Configuration" title="Settings" description="Configure your workspace, fields and integrations." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-col gap-0.5 rounded-xl border border-border bg-canvas p-2">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm",
                active === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
              )}
            >{s}</button>
          ))}
        </nav>

        <Card>
          <h3 className="text-base font-semibold">{active}</h3>
          {active === "Organisation" && (
            <div className="mt-4 max-w-md space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Default currency</span>
                <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option>QAR</option>
                  <option>AED</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
              <Button size="sm" onClick={saveCurrency} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          )}
          {active === "Pipeline stages" && (
            <ul className="mt-4 space-y-1 text-sm">
              {PIPELINE_STAGES.map((s, i) => (
                <li key={s.key} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                  {i + 1}. {s.label} <span className="ml-2 text-xs text-muted-foreground">({s.key})</span>
                </li>
              ))}
            </ul>
          )}
          {active !== "Organisation" && active !== "Pipeline stages" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Configuration for this section will appear here. API keys and sensitive credentials are never exposed in the frontend.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
