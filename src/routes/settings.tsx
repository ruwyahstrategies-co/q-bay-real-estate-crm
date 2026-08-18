import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users, Clock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { PermissionGate } from "@/components/permission-gate";
import { PipelineStagesManager } from "@/components/pipeline-stages-manager";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { sb } from "@/lib/db";
import { APP_CONFIG } from "@/lib/config";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

const sections = [
  "Organisation",
  "Pipeline stages",
  "Permissions",
  "Security",
  "Lead & property fields",
  "Notifications",
  "Data retention",
] as const;

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function SettingsPage() {
  const [active, setActive] = useState<(typeof sections)[number]>(sections[0]);
  const [currency, setCurrency] = useState("QAR");
  const [orgName, setOrgName] = useState<string>(APP_CONFIG.companyName);
  const [saving, setSaving] = useState(false);
  const { can } = usePermissions();
  const { roleLabel, teamMember } = useCurrentUser();
  const canManage = can("settings", "manage");

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("app_settings").select("setting_value").eq("setting_key", "default_currency").maybeSingle();
      const v = (data?.setting_value as { value?: string } | null)?.value;
      if (v) setCurrency(v);
      const { data: nameRow } = await sb.from("app_settings").select("setting_value").eq("setting_key", "organisation_name").maybeSingle();
      const n = (nameRow?.setting_value as { value?: string } | null)?.value;
      if (n) setOrgName(n);
    })();
  }, []);

  async function saveOrganisation() {
    setSaving(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      sb.from("app_settings").upsert({ setting_key: "default_currency", setting_value: { value: currency } }, { onConflict: "setting_key" }),
      sb.from("app_settings").upsert({ setting_key: "organisation_name", setting_value: { value: orgName } }, { onConflict: "setting_key" }),
    ]);
    setSaving(false);
    if (e1 || e2) toast.error((e1 || e2)!.message);
    else toast.success("Saved");
  }

  return (
    <AppShell>
      <PermissionGate module="settings" action="view" page>
      <PageHeader eyebrow="Configuration" title="Settings" description="Configure your workspace, pipeline and access." />

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
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Organisation name</span>
                <input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!canManage} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Default currency</span>
                <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canManage}>
                  <option>QAR</option>
                  <option>AED</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
              {canManage ? (
                <Button size="sm" onClick={saveOrganisation} disabled={saving}>{saving ? "Saving--¦" : "Save"}</Button>
              ) : (
                <p className="text-xs text-muted-foreground">You have read-only access to organisation settings.</p>
              )}
            </div>
          )}

          {active === "Pipeline stages" && (
            canManage ? <div className="mt-4"><PipelineStagesManager /></div> : (
              <p className="mt-2 text-sm text-muted-foreground">You don't have permission to manage pipeline stages.</p>
            )
          )}

          {active === "Permissions" && (
            <div className="mt-4 max-w-md space-y-3 text-sm">
              <p className="text-muted-foreground">
                Permissions are granted per staff member from the Team page --- role presets set sensible defaults, and
                individual modules/actions can be overridden per person.
              </p>
              <Link to="/team">
                <Button size="sm" variant="outline"><Users className="h-3.5 w-3.5" /> Open Team & Permissions</Button>
              </Link>
            </div>
          )}

          {active === "Security" && (
            <div className="mt-4 max-w-lg space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">Signed in via Supabase Auth</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You're signed in as <strong>{teamMember?.email ?? "---"}</strong> with the{" "}
                    <strong className="capitalize">{roleLabel.replace(/_/g, " ")}</strong> role.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Staff logins are created and revoked from the Team page --- only administrators can create new logins.
                Passwords are never stored or visible in this application; resets issue a new temporary password directly
                through Supabase Auth. Row-level authorization on the database is documented in
                {" "}<code className="rounded bg-muted px-1 py-0.5">BACKEND_REQUIREMENTS.md</code> for backend implementation.
              </p>
            </div>
          )}

          {(active === "Lead & property fields" || active === "Notifications" || active === "Data retention") && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed border-border bg-background p-4">
              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Planned for a future release</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {active === "Lead & property fields" && "Custom field configuration for leads and properties is on the roadmap. Today's fields cover the full buyer and inventory workflow."}
                  {active === "Notifications" && "In-app and email notification preferences are on the roadmap."}
                  {active === "Data retention" && "Automated archival and retention policies are on the roadmap. Leads and properties can be archived manually today."}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
      </PermissionGate>
    </AppShell>
  );
}
