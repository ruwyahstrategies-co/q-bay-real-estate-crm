import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldCheck, Users, Clock, MessageCircle, MapPinned, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { PermissionGate } from "@/components/permission-gate";
import { PipelineStagesManager } from "@/components/pipeline-stages-manager";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { sb, type Area, type AreaUpdate } from "@/lib/db";
import { APP_CONFIG } from "@/lib/config";
import { useMyWhatsappConnection, useSaveWhatsappConnection, useVerifyWhatsapp, useDisconnectWhatsapp } from "@/hooks/use-whatsapp";
import { useCountries, useAreas, useCreateCountry, useUpdateCountry, useCreateArea, useUpdateArea } from "@/hooks/use-locations";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

const sections = [
  "Organisation",
  "Pipeline stages",
  "Locations",
  "Permissions",
  "My WhatsApp Connection",
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
                <Button size="sm" onClick={saveOrganisation} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
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

          {active === "Locations" && <LocationsSection canManage={canManage} />}

          {active === "My WhatsApp Connection" && <WhatsappSection />}

          {active === "Permissions" && (
            <div className="mt-4 max-w-md space-y-3 text-sm">
              <p className="text-muted-foreground">
                Permissions are granted per staff member from the Team page - role presets set sensible defaults, and
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
                    You're signed in as <strong>{teamMember?.email ?? "-"}</strong> with the{" "}
                    <strong className="capitalize">{roleLabel.replace(/_/g, " ")}</strong> role.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Staff logins are created and revoked from the Team page - only administrators can create new logins.
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

function WhatsappSection() {
  const { data: connection, isLoading } = useMyWhatsappConnection();
  const save = useSaveWhatsappConnection();
  const verify = useVerifyWhatsapp();
  const disconnect = useDisconnectWhatsapp();

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  useEffect(() => {
    if (!connection) return;
    setPhoneNumberId(connection.phone_number_id ?? "");
    setWabaId(connection.waba_id ?? "");
    setDisplayNumber(connection.display_phone_number ?? "");
  }, [connection?.id]);

  async function handleSave() {
    if (!phoneNumberId.trim()) return toast.error("Phone Number ID is required");
    try {
      await save.mutateAsync({
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId || undefined,
        display_phone_number: displayNumber || undefined,
        access_token: accessToken || undefined,
        webhook_verify_token: verifyToken || undefined,
      });
      setAccessToken("");
      setVerifyToken("");
      toast.success("WhatsApp connection saved");
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mt-4 max-w-lg space-y-4 text-sm">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
        <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-medium">Your own WhatsApp Business (Meta Cloud API) connection</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each staff member connects their own WhatsApp Business number here. There is no shared/global
            WhatsApp sender - your access token is stored encrypted and is never shown again after saving.
          </p>
          {!isLoading && connection && (
            <p className="mt-2 text-xs">
              Status: <span className={cn("font-medium", connection.connection_status === "connected" ? "text-foreground" : "text-muted-foreground")}>
                {connection.connection_status}
              </span>
              {connection.display_phone_number ? ` - ${connection.display_phone_number}` : ""}
            </p>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone Number ID *</span>
        <input className={inputCls} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="From Meta Business Suite" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">WhatsApp Business Account ID</span>
        <input className={inputCls} value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Display phone number</span>
        <input className={inputCls} value={displayNumber} onChange={(e) => setDisplayNumber(e.target.value)} placeholder="+974..." />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Access token {connection ? "(leave blank to keep current)" : "*"}</span>
        <input className={inputCls} type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Meta permanent access token" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Webhook verify token (optional)</span>
        <input className={inputCls} value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="Shared secret for Meta's webhook subscription" />
      </label>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save connection"}</Button>
        {connection && (
          <Button size="sm" variant="outline" onClick={async () => {
            try { const r = await verify.mutateAsync(); if (r.ok) toast.success("Connection verified"); else toast.error(r.error ?? "Verification failed"); }
            catch (e) { toast.error((e as Error).message); }
          }} disabled={verify.isPending}>{verify.isPending ? "Verifying..." : "Verify connection"}</Button>
        )}
        {connection && (
          <Button size="sm" variant="ghost" onClick={async () => {
            try { await disconnect.mutateAsync(); toast.success("Disconnected"); setPhoneNumberId(""); setWabaId(""); setDisplayNumber(""); }
            catch (e) { toast.error((e as Error).message); }
          }} disabled={disconnect.isPending}>Disconnect</Button>
        )}
      </div>
    </div>
  );
}

function LocationsSection({ canManage }: { canManage: boolean }) {
  const { data: countries = [] } = useCountries();
  const createCountry = useCreateCountry();
  const updateCountry = useUpdateCountry();
  const [newCountry, setNewCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const { data: areas = [] } = useAreas(selectedCountry || undefined);
  const createArea = useCreateArea();
  const updateArea = useUpdateArea();
  const [newArea, setNewArea] = useState("");
  const [editingArea, setEditingArea] = useState<string | null>(null);

  return (
    <div className="mt-4 max-w-2xl space-y-5 text-sm">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <MapPinned className="h-4 w-4" />
          <h4 className="font-semibold">Countries</h4>
        </div>
        <div className="space-y-1.5">
          {countries.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <button className={cn("text-xs", selectedCountry === c.id && "font-semibold")} onClick={() => setSelectedCountry(c.id)}>{c.name}</button>
              <button
                disabled={!canManage}
                onClick={() => updateCountry.mutate({ id: c.id, patch: { is_active: !c.is_active } })}
                className={cn("rounded-full px-2 py-0.5 text-[11px]", c.is_active ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
              >{c.is_active ? "Active" : "Inactive"}</button>
            </div>
          ))}
        </div>
        {canManage && (
          <div className="mt-2 flex gap-2">
            <input className={inputCls} value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="New country..." />
            <Button size="sm" onClick={async () => {
              const name = newCountry.trim();
              if (!name) return;
              try {
                await createCountry.mutateAsync({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), display_order: countries.length });
                setNewCountry("");
              } catch (e) { toast.error((e as Error).message); }
            }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>

      {selectedCountry && (
        <div>
          <h4 className="mb-2 font-semibold">Areas in {countries.find((c) => c.id === selectedCountry)?.name}</h4>
          <div className="space-y-1.5">
            {areas.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-background px-3 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!canManage}
                      onClick={() => updateArea.mutate({ id: a.id, patch: { is_active: !a.is_active } })}
                      className={cn("rounded-full px-2 py-0.5 text-[11px]", a.is_active ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
                    >{a.is_active ? "Active" : "Inactive"}</button>
                    {canManage && (
                      <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setEditingArea(editingArea === a.id ? null : a.id)}>
                        {editingArea === a.id ? "Close" : "Website content"}
                      </button>
                    )}
                  </div>
                </div>
                {editingArea === a.id && <AreaContentEditor area={a} onSave={(patch) => updateArea.mutate({ id: a.id, patch })} />}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-2 flex gap-2">
              <input className={inputCls} value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="New area..." />
              <Button size="sm" onClick={async () => {
                const name = newArea.trim();
                if (!name) return;
                try {
                  await createArea.mutateAsync({ country_id: selectedCountry, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), display_order: areas.length });
                  setNewArea("");
                } catch (e) { toast.error((e as Error).message); }
              }}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AreaContentEditor({ area, onSave }: { area: Area; onSave: (patch: AreaUpdate) => void }) {
  const [tagline, setTagline] = useState(area.tagline ?? "");
  const [lifestyle, setLifestyle] = useState(area.lifestyle ?? "");
  const [blurb, setBlurb] = useState(area.blurb ?? "");
  const [about, setAbout] = useState(area.about ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(area.hero_image_url ?? "");

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Shown on the public website's area page. Leave blank to fall back to neutral copy.
      </p>
      <input className={inputCls} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline (e.g. Qatar's city of the future)" />
      <input className={inputCls} value={lifestyle} onChange={(e) => setLifestyle(e.target.value)} placeholder="Lifestyle tag (e.g. Waterfront - New-build)" />
      <textarea className={cn(inputCls, "min-h-16")} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Short blurb (1-2 sentences)" />
      <textarea className={cn(inputCls, "min-h-24")} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="About this area (longer editorial copy, one paragraph per line)" />
      <input className={inputCls} value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="Hero image URL" />
      <Button
        size="sm"
        onClick={() => onSave({
          tagline: tagline || null,
          lifestyle: lifestyle || null,
          blurb: blurb || null,
          about: about || null,
          hero_image_url: heroImageUrl || null,
        })}
      >
        Save
      </Button>
    </div>
  );
}
