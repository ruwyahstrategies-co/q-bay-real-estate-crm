import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui-primitives";
import {
  useRegisterWhatsappTemplate,
  useSetWhatsappMode,
  useSyncWhatsappTemplates,
  useWhatsappStatus,
  useWhatsappTemplates,
} from "@/hooks/use-whatsapp";
import { cn } from "@/lib/utils";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25";

const MODES = [
  { value: "shared", label: "One shared company number", hint: "Everyone messages from the same WhatsApp number. A manager connects it once." },
  { value: "individual", label: "Each agent's own number", hint: "Every agent connects and uses their own WhatsApp Business number." },
  { value: "undecided", label: "Not decided yet", hint: "Each person uses their own connection if they have one, otherwise the company number." },
] as const;

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-qbay" aria-hidden />
      ) : (
        <Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"> - {detail}</span>
      </span>
    </li>
  );
}

/** The readiness checklist, the number model, the webhook address and the approved templates. */
export function WhatsappSetupPanel() {
  const { data: status, isLoading } = useWhatsappStatus();
  const setMode = useSetWhatsappMode();
  const { data: templates = [] } = useWhatsappTemplates(true);
  const sync = useSyncWhatsappTemplates();
  const register = useRegisterWhatsappTemplate();

  const [tplName, setTplName] = useState("");
  const [tplLang, setTplLang] = useState("en");
  const [tplWaba, setTplWaba] = useState("");
  const [tplBody, setTplBody] = useState("");

  if (isLoading || !status) return null;

  async function addTemplate() {
    try {
      await register.mutateAsync({
        waba_id: tplWaba.trim() || status?.company_connection?.waba_id || "",
        name: tplName.trim(),
        language: tplLang.trim() || "en",
        body_text: tplBody.trim(),
      });
      setTplName("");
      setTplBody("");
      toast.success("Template saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="text-sm font-medium">Readiness</p>
        <ul className="mt-2 space-y-1.5">
          <Row
            ok={status.live_enabled}
            label="Live messaging"
            detail={status.live_enabled ? "switched on" : "switched off. Nothing is sent or received yet."}
          />
          <Row
            ok={status.app_secret_configured}
            label="Meta app secret"
            detail={status.app_secret_configured ? "set on the server. Incoming messages are signature checked." : "not set. Incoming messages are refused until it is."}
          />
          <Row
            ok={status.verify_token_configured}
            label="Webhook verify token"
            detail={status.verify_token_configured ? "set on the server" : "not set"}
          />
          <Row
            ok={status.mode !== "undecided"}
            label="Number model"
            detail={MODES.find((m) => m.value === status.mode)?.label ?? ""}
          />
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          The secrets above are kept in the Supabase Edge Function settings (META_APP_SECRET, WHATSAPP_VERIFY_TOKEN,
          WHATSAPP_LIVE_ENABLED), never in this screen or the code.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <p className="text-sm font-medium">Webhook address for Meta</p>
        <input className={cn(inputCls, "mt-2 font-mono text-xs")} readOnly value={status.webhook_url} onFocus={(e) => e.currentTarget.select()} aria-label="Webhook address" />
        <p className="mt-1.5 text-[11px] text-muted-foreground">Paste this as the callback URL in the Meta app's WhatsApp settings, with the verify token set on the server.</p>
      </div>

      {status.can_manage ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">Which numbers does the company use?</p>
          <div className="mt-2 space-y-2">
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="whatsapp-mode"
                  className="mt-0.5"
                  checked={status.mode === m.value}
                  disabled={setMode.isPending}
                  onChange={async () => {
                    try {
                      await setMode.mutateAsync(m.value);
                      toast.success("Saved");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                />
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {status.company_connection ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Company number: {status.company_connection.display_phone_number ?? status.company_connection.phone_number_id} (
              {status.company_connection.connection_status})
            </p>
          ) : null}
        </div>
      ) : null}

      {status.can_manage ? (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Approved templates</p>
            <Button
              size="sm"
              variant="outline"
              disabled={sync.isPending}
              onClick={async () => {
                try {
                  const r = await sync.mutateAsync();
                  toast.success(`${r.synced} templates read from Meta, ${r.approved} approved`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {sync.isPending ? "Reading..." : "Sync from Meta"}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Meta only allows a business to start a conversation, or write after 24 hours, with a template it has approved.
          </p>
          {templates.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No templates yet. Sync from Meta once the connection is verified.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-xs">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{t.name}</span> <span className="text-muted-foreground">({t.language}, {t.param_count} value{t.param_count === 1 ? "" : "s"})</span>
                  </span>
                  <span className={cn("flex-shrink-0", t.status === "approved" ? "text-foreground" : "text-muted-foreground")}>
                    {t.status}
                    {t.source === "manual" ? " (entered by hand)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-medium">Enter a template by hand</summary>
            <p className="mt-2 text-muted-foreground">
              For preparing the screens before Meta access exists. Meta still checks the template when a message is sent, so a wrong entry fails safely.
            </p>
            <div className="mt-2 space-y-2">
              <input className={inputCls} placeholder="Template name, e.g. viewing_reminder" value={tplName} onChange={(e) => setTplName(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Language, e.g. en" value={tplLang} onChange={(e) => setTplLang(e.target.value)} />
                <input className={inputCls} placeholder="WhatsApp Business Account ID" value={tplWaba} onChange={(e) => setTplWaba(e.target.value)} />
              </div>
              <textarea
                className="min-h-16 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                placeholder="Body, with {{1}}, {{2}} for the values"
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
              />
              <Button size="sm" disabled={register.isPending || !tplName.trim() || !tplBody.trim()} onClick={addTemplate}>
                Save template
              </Button>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
