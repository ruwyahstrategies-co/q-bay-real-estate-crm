import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  PhoneCall, RefreshCw, Copy, Settings as SettingsIcon, CheckCircle2,
  AlertCircle, Clock, PhoneForwarded, X, MessageSquare, Wrench,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card, SectionTitle } from "@/components/ui-primitives";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/db";
import { toast } from "sonner";
import {
  useReceptionistStatus, useReceptionistSettings, useUpdateReceptionistSettings,
  useReceptionistCalls, useReceptionistCallToolEvents,
  type ReceptionistCall, type ReceptionistSettings, type ReceptionistStatus,
} from "@/hooks/use-receptionist";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/ai-receptionist")({
  head: () => ({ meta: [{ title: "AI Receptionist" }] }),
  component: AIReceptionistPage,
});

type Tab = "status" | "settings" | "calls";

function AIReceptionistPage() {
  const [tab, setTab] = useState<Tab>("status");
  const [openCall, setOpenCall] = useState<ReceptionistCall | null>(null);

  return (
    <AppShell>
      <PermissionGate module="ai_receptionist" action="view" page>
      <PageHeader
        eyebrow="Voice Channel"
        title="AI Receptionist"
        description="Inbound call handling powered by ElevenLabs Agents and Twilio. Configure tools, monitor connection health, and review call transcripts."
      />

      <div className="mb-5 flex gap-1 rounded-lg border border-border bg-canvas p-1 w-fit">
        {(["status", "settings", "calls"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              tab === t ? "bg-foreground text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "status" && <StatusTab onOpenSettings={() => setTab("settings")} />}
      {tab === "settings" && <SettingsTab />}
      {tab === "calls" && <CallsTab onOpen={setOpenCall} />}

      {openCall && <CallDetailDrawer call={openCall} onClose={() => setOpenCall(null)} />}
      </PermissionGate>
    </AppShell>
  );
}

// --------------------------------------------------------------------------------------------- Status ------------------------------------------------------------------------------------------------

function StatusTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: status, isLoading, refetch, isFetching } = useReceptionistStatus();
  const { data: settings } = useReceptionistSettings();

  const phone = status?.twilio.phone_number_masked;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <SectionTitle
          title="Connection status"
          actions={
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          }
        />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking--¦</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">Unable to load status.</p>
        ) : (
          <div className="space-y-3">
            <ModeBanner status={status} />
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <StatusRow ok={status.elevenlabs.api_key_present} label="ElevenLabs API key" />
              <StatusRow ok={status.elevenlabs.agent_id_present} label="ElevenLabs agent" value={status.elevenlabs.agent_id_masked} />
              <StatusRow ok={status.elevenlabs.webhook_secret_present} label="Post-call webhook secret" />
              <StatusRow ok={status.twilio.account_sid_present} label="Twilio account" value={status.twilio.account_sid_masked} />
              <StatusRow ok={status.twilio.phone_number_present} label="Connected phone number" value={phone} />
              <StatusRow ok={status.transfer.number_present} label="Human transfer number" value={status.transfer.number_masked} />
              <StatusRow ok={status.inbound_ready} label="Inbound calling" />
              <StatusRow
                ok={!!status.last_webhook_at}
                label="Last successful webhook"
                value={status.last_webhook_at ? fmtDateTime(status.last_webhook_at) : "Never"}
              />
            </div>
            <p className="pt-2 text-[11px] text-muted-foreground">
              Credentials are stored server-side. The dashboard only shows masked identifiers.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Actions" />
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!phone}
            onClick={() => {
              const raw = phone ?? "";
              navigator.clipboard.writeText(raw);
              toast.success("Phone number copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy phone number
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!status?.elevenlabs.agent_id_present}
            onClick={() =>
              toast.info("Browser test requires the ElevenLabs widget to be configured with the agent id.")
            }
          >
            <PhoneCall className="h-3.5 w-3.5" /> Test agent in browser
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            <SettingsIcon className="h-3.5 w-3.5" /> Open receptionist settings
          </Button>
        </div>
        {settings && (
          <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs">
            <p className="font-medium">Current operating mode</p>
            <p className="mt-1 text-muted-foreground">
              {settings.enabled ? "Enabled" : "Disabled"} Â·{" "}
              {(settings.languages as string[] | null)?.join(", ") || "en"} Â·{" "}
              {settings.after_hours_behaviour ?? "take_message"} after hours
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ModeBanner({ status }: { status: ReceptionistStatus }) {
  const map = {
    live: { bg: "bg-pastel-green", icon: CheckCircle2, label: "Live --- agent reachable" },
    partial: { bg: "bg-pastel-cream", icon: AlertCircle, label: "Partial configuration --- see missing items" },
    not_configured: { bg: "bg-muted", icon: AlertCircle, label: "Not configured --- add ElevenLabs and Twilio secrets" },
  } as const;
  const m = map[status.mode];
  const Icon = m.icon;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", m.bg)}>
      <Icon className="h-4 w-4" />
      <span className="font-medium">{m.label}</span>
    </div>
  );
}

function StatusRow({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
        <span className="text-xs">{label}</span>
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{value ?? (ok ? "set" : "missing")}</span>
    </div>
  );
}

// --------------------------------------------------------------------------------------------- Settings ------------------------------------------------------------------------------------------

function SettingsTab() {
  const { data: settings, isLoading } = useReceptionistSettings();
  const update = useUpdateReceptionistSettings();
  const [draft, setDraft] = useState<Partial<ReceptionistSettings> | null>(null);

  if (isLoading) return <Card><p className="text-sm text-muted-foreground">Loading--¦</p></Card>;
  if (!settings) return <Card><p className="text-sm text-muted-foreground">Settings unavailable.</p></Card>;

  const s = { ...settings, ...(draft ?? {}) };

  const onChange = <K extends keyof ReceptionistSettings>(key: K, value: ReceptionistSettings[K]) =>
    setDraft((d) => ({ ...(d ?? {}), [key]: value }));

  const save = () => {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () => { toast.success("Settings saved"); setDraft(null); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionTitle title="Identity & greeting" />
        <Field label="Agent display name">
          <Input value={s.agent_display_name ?? ""} onChange={(v) => onChange("agent_display_name", v)} />
        </Field>
        <Field label="Greeting">
          <Textarea value={s.greeting ?? ""} onChange={(v) => onChange("greeting", v)} />
        </Field>
        <Field label="Supported languages (comma separated)">
          <Input
            value={(s.languages as string[] | null)?.join(", ") ?? ""}
            onChange={(v) => onChange("languages", v.split(",").map((x) => x.trim()).filter(Boolean) as never)}
          />
        </Field>
      </Card>

      <Card>
        <SectionTitle title="Hours & limits" />
        <Field label="After-hours behaviour">
          <select
            className="h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm"
            value={s.after_hours_behaviour ?? "take_message"}
            onChange={(e) => onChange("after_hours_behaviour", e.target.value)}
          >
            <option value="take_message">Take a message</option>
            <option value="offer_callback">Offer callback</option>
            <option value="forward_to_human">Forward to human</option>
            <option value="closed">Closed (announce only)</option>
          </select>
        </Field>
        <Field label="Human transfer number (display only --- value lives in server secret)">
          <Input value={s.human_transfer_number ?? ""} onChange={(v) => onChange("human_transfer_number", v)} />
        </Field>
        <Field label="Max call duration (seconds)">
          <Input
            type="number"
            value={String(s.max_call_duration_seconds ?? 900)}
            onChange={(v) => onChange("max_call_duration_seconds", Number(v) || 900)}
          />
        </Field>
      </Card>

      <Card className="lg:col-span-2">
        <SectionTitle title="Rules" />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Required lead fields (comma separated)">
            <Input
              value={(s.required_lead_fields as string[] | null)?.join(", ") ?? ""}
              onChange={(v) => onChange("required_lead_fields", v.split(",").map((x) => x.trim()).filter(Boolean) as never)}
            />
          </Field>
          <Field label="Allowed property information">
            <Input
              value={(s.allowed_property_info as string[] | null)?.join(", ") ?? ""}
              onChange={(v) => onChange("allowed_property_info", v.split(",").map((x) => x.trim()).filter(Boolean) as never)}
            />
          </Field>
          <Field label="Qualification questions (one per line)">
            <Textarea
              value={(s.qualification_questions as string[] | null)?.join("\n") ?? ""}
              onChange={(v) => onChange("qualification_questions", v.split("\n").map((x) => x.trim()).filter(Boolean) as never)}
            />
          </Field>
          <Field label="Outbound test allowlist (one E.164 number per line)">
            <Textarea
              value={(s.outbound_test_allowlist as string[] | null)?.join("\n") ?? ""}
              onChange={(v) => onChange("outbound_test_allowlist", v.split("\n").map((x) => x.trim()).filter(Boolean) as never)}
            />
          </Field>
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end gap-2">
        <Button variant="ghost" disabled={!draft} onClick={() => setDraft(null)}>Discard</Button>
        <Button onClick={save} disabled={!draft || update.isPending}>
          {update.isPending ? "Saving--¦" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Input({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
    />
  );
}
function Textarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
    />
  );
}

// --------------------------------------------------------------------------------------------- Calls ---------------------------------------------------------------------------------------------------

function CallsTab({ onOpen }: { onOpen: (call: ReceptionistCall) => void }) {
  const { data, isLoading } = useReceptionistCalls();

  if (isLoading) return <Card><p className="text-sm text-muted-foreground">Loading calls--¦</p></Card>;
  if (!data || data.length === 0) {
    return (
      <Card className="text-center">
        <PhoneCall className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No calls yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Once the ElevenLabs post-call webhook is connected, every completed call will appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Caller</th>
            <th className="px-4 py-2.5">Lead</th>
            <th className="px-4 py-2.5">When</th>
            <th className="px-4 py-2.5">Duration</th>
            <th className="px-4 py-2.5">Outcome</th>
            <th className="px-4 py-2.5">Intent</th>
            <th className="px-4 py-2.5">Properties</th>
            <th className="px-4 py-2.5">Transfer</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => {
            // deno-lint-ignore no-explicit-any
            const lead = (c as any).leads;
            const mentions = Array.isArray(c.properties_mentioned) ? (c.properties_mentioned as unknown[]).length : 0;
            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c as ReceptionistCall)}
                className="cursor-pointer border-t border-border hover:bg-muted/30"
              >
                <td className="px-4 py-2.5 font-mono text-xs">{c.caller_number ?? "---"}</td>
                <td className="px-4 py-2.5">
                  {lead?.full_name ?? <span className="text-xs text-muted-foreground">{c.is_new_lead ? "New" : "---"}</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(c.started_at ?? c.created_at)}</td>
                <td className="px-4 py-2.5 text-xs">{c.duration_seconds ? `${c.duration_seconds}s` : "---"}</td>
                <td className="px-4 py-2.5 text-xs">{c.outcome ?? c.status ?? "---"}</td>
                <td className="px-4 py-2.5 text-xs">{c.intent_level ?? "---"}</td>
                <td className="px-4 py-2.5 text-xs">{mentions || "---"}</td>
                <td className="px-4 py-2.5 text-xs">
                  {c.transfer_status ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <PhoneForwarded className="h-3 w-3" />{c.transfer_status}
                    </span>
                  ) : "---"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// --------------------------------------------------------------------------------- Call Detail Drawer ------------------------------------------------------------------------

function CallDetailDrawer({ call, onClose }: { call: ReceptionistCall; onClose: () => void }) {
  const { data: events } = useReceptionistCallToolEvents(call.id);
  const transcriptText = formatTranscript(call.transcript);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-canvas shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receptionist call</p>
            <p className="font-mono text-sm">{call.caller_number ?? "Unknown caller"}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <Meta label="Started" value={fmtDateTime(call.started_at)} />
            <Meta label="Duration" value={call.duration_seconds ? `${call.duration_seconds}s` : "---"} />
            <Meta label="Outcome" value={call.outcome ?? call.status} />
            <Meta label="Intent level" value={call.intent_level ?? "---"} />
            <Meta label="Transfer" value={call.transfer_status ?? "---"} />
            <Meta label="Conversation id" value={call.elevenlabs_conversation_id ?? "---"} mono />
          </div>

          {call.summary && (
            <Section title="Summary"><p className="text-sm">{call.summary}</p></Section>
          )}

          {call.extracted_data && Object.keys(call.extracted_data as object).length > 0 && (
            <Section title="Extracted data">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-[11px]">
                {JSON.stringify(call.extracted_data, null, 2)}
              </pre>
            </Section>
          )}

          {Array.isArray(call.properties_mentioned) && (call.properties_mentioned as unknown[]).length > 0 && (
            <Section title="Properties discussed">
              <div className="flex flex-wrap gap-1.5">
                {(call.properties_mentioned as string[]).map((p, i) => (
                  <span key={i} className="rounded-full bg-pastel-blue px-2 py-0.5 text-[11px]">{p}</span>
                ))}
              </div>
            </Section>
          )}

          {events && events.length > 0 && (
            <Section title="Tools used">
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
                    <Wrench className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{e.tool_name}{!e.success && <span className="ml-2 text-red-600">failed</span>}</p>
                      {e.error && <p className="mt-0.5 text-red-600">{e.error}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{fmtDateTime(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {transcriptText && (
            <Section title="Transcript">
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
                {transcriptText}
              </pre>
            </Section>
          )}

          {call.recording_url && (
            <Section title="Recording">
              <audio controls src={call.recording_url} className="w-full" />
            </Section>
          )}

          {!transcriptText && !call.summary && (
            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
              <MessageSquare className="mb-2 h-4 w-4" />
              This call has no transcript yet. It will populate after the post-call webhook is delivered.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono text-[10px]")}>{value ?? "---"}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function formatTranscript(t: unknown): string | null {
  if (!t) return null;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((m) => {
        // deno-lint-ignore no-explicit-any
        const r = (m as any).role ?? (m as any).speaker ?? "speaker";
        // deno-lint-ignore no-explicit-any
        const text = (m as any).message ?? (m as any).text ?? (m as any).content ?? "";
        return `${r}: ${text}`;
      })
      .join("\n");
  }
  return null;
}

// Clock import kept for tree-shake compatibility in case of future use
void Clock;
