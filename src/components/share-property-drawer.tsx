import { useEffect, useMemo, useState } from "react";
import { X, Copy, FileText, MessageCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-auth";
import { useLeads } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { useAreas, usePlaces } from "@/hooks/use-locations";
import { useMyWhatsappConnection } from "@/hooks/use-whatsapp";
import { usePropertyShares, useSharePropertyWithLeads } from "@/hooks/use-property-shares";
import { buildPropertyShareMessage } from "@/lib/property-share";
import { LEAD_CLASSIFICATION_LABELS, fmtDate, fmtMoney, type Property } from "@/lib/db";

const MAX_ROWS = 100;

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/**
 * Share one property with several leads at once. Every share is recorded in
 * the CRM (property_shares). External delivery only happens through the
 * signed-in agent's own connected WhatsApp, and only when they opt in; when
 * that is not available the drawer says so plainly and nothing is delivered
 * externally.
 */
export function SharePropertyDrawer({
  open,
  onOpenChange,
  property,
  onSharePdf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property;
  onSharePdf?: () => void;
}) {
  const { can } = usePermissions();
  const { data: leads = [], isLoading } = useLeads({ status: "active" });
  const { data: team = [] } = useTeamMembers();
  const { data: areas = [] } = useAreas();
  const { data: places = [] } = usePlaces();
  const { data: priorShares = [] } = usePropertyShares(open ? property.id : undefined);
  const { data: myConnection } = useMyWhatsappConnection();
  const share = useSharePropertyWithLeads();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [messageEdited, setMessageEdited] = useState(false);
  const [sendViaWhatsapp, setSendViaWhatsapp] = useState(false);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());

  const canSendWhatsapp = myConnection?.connection_status === "connected" && can("conversations", "create");

  const locationLabel = useMemo(() => {
    const areaName = areas.find((a) => a.id === property.area_id)?.name;
    const placeName = places.find((p) => p.id === property.place_id)?.name;
    return [placeName, areaName].filter(Boolean).join(", ") || null;
  }, [areas, places, property.area_id, property.place_id]);

  const defaultMessage = useMemo(
    () => buildPropertyShareMessage(property, locationLabel),
    [property, locationLabel],
  );

  // Fresh state (and a fresh de-duplication id) each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set());
    setMessageEdited(false);
    setSendViaWhatsapp(false);
    setBatchId(crypto.randomUUID());
  }, [open, property.id]);

  useEffect(() => {
    if (open && !messageEdited) setMessage(defaultMessage);
  }, [open, messageEdited, defaultMessage]);

  const agentName = (id: string | null) => team.find((t) => t.id === id)?.full_name ?? "Unassigned";
  const lastSharedByLead = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of priorShares) if (!map.has(s.lead_id)) map.set(s.lead_id, s.shared_at);
    return map;
  }, [priorShares]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(
      (l) =>
        l.full_name.toLowerCase().includes(term) ||
        (l.phone ?? "").toLowerCase().includes(term) ||
        (l.email ?? "").toLowerCase().includes(term),
    );
  }, [leads, search]);
  const shown = matches.slice(0, MAX_ROWS);
  const selectedLeads = leads.filter((l) => selected.has(l.id));
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));
  const selectedWithPhone = selectedLeads.filter((l) => !!l.phone).length;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function locationFor(l: (typeof leads)[number]): string {
    const area = areas.find((a) => a.id === l.preferred_area_id)?.name;
    const place = places.find((p) => p.id === l.preferred_place_id)?.name;
    if (area) return [area, place].filter(Boolean).join(" / ");
    return l.preferred_locations?.join(", ") || "";
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  async function handleShare() {
    if (share.isPending || selectedLeads.length === 0) return;
    try {
      const res = await share.mutateAsync({
        propertyId: property.id,
        leads: selectedLeads.map((l) => ({ id: l.id, phone: l.phone })),
        message,
        batchId,
        sendViaWhatsapp: sendViaWhatsapp && canSendWhatsapp,
      });
      if (res.recorded === 0 && res.duplicates > 0) {
        toast.info("This share was already recorded. Nothing new was added.");
      } else if (!res.whatsapp.attempted) {
        toast.success(
          `Recorded ${res.recorded} share${res.recorded === 1 ? "" : "s"} in the CRM. Nothing was delivered externally.`,
        );
      } else {
        toast.success(`Recorded ${res.recorded} in the CRM. WhatsApp: ${res.whatsapp.sent} sent, ${res.whatsapp.failed} failed.`);
        if (res.whatsapp.failed > 0 && res.whatsapp.firstError) {
          toast.warning(`WhatsApp problem: ${res.whatsapp.firstError}`);
        }
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const willSendWhatsapp = sendViaWhatsapp && canSendWhatsapp;

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} widthClassName="max-w-2xl" ariaLabel="Share property with leads">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Share with leads</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {property.reference_code ? `${property.reference_code} · ` : ""}
            {property.title}
          </p>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Choose leads
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span>{selected.size} selected</span>
              <button
                type="button"
                className="text-muted-foreground hover:underline disabled:opacity-50"
                disabled={shown.length === 0}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const l of shown) {
                      if (allShownSelected) next.delete(l.id);
                      else next.add(l.id);
                    }
                    return next;
                  })
                }
              >
                {allShownSelected ? "Unselect shown" : "Select shown"}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline disabled:opacity-50"
                disabled={selected.size === 0}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          </div>
          <input
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email..."
            aria-label="Search leads"
          />
          <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border">
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading leads...</p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                {leads.length === 0 ? "No leads are available to you." : "No leads match this search."}
              </p>
            ) : (
              <ul>
                {shown.map((l) => {
                  const checked = selected.has(l.id);
                  const lastShared = lastSharedByLead.get(l.id);
                  const loc = locationFor(l);
                  return (
                    <li key={l.id} className="border-b border-border last:border-0">
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-background/60",
                          checked && "bg-background",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={(e) => toggle(l.id, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                            {l.full_name}
                            {lastShared && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
                                Already shared {fmtDate(lastShared)}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {[
                              l.phone ?? "No phone",
                              l.classification
                                ? (LEAD_CLASSIFICATION_LABELS[l.classification] ?? l.classification)
                                : null,
                              `Agent: ${agentName(l.assigned_agent_id)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {(loc || l.budget_max) && (
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {[loc, l.budget_max ? `Budget up to ${fmtMoney(l.budget_max, l.currency)}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {matches.length > MAX_ROWS && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Showing the first {MAX_ROWS} of {matches.length} matches. Refine the search to narrow it down.
            </p>
          )}
        </div>

        {selectedLeads.length > 0 && (
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Recipients ({selectedLeads.length})
            </span>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {selectedLeads.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                >
                  {l.full_name}
                  <button
                    type="button"
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted"
                    onClick={() => toggle(l.id, false)}
                    aria-label={`Remove ${l.full_name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Message</span>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:underline" onClick={copyMessage}>
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <textarea
            className={cn(inputCls, "h-32 py-2")}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setMessageEdited(true);
            }}
          />
          {!property.is_published && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              This property is not published, so the message has no public link.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          {canSendWhatsapp ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sendViaWhatsapp}
                onChange={(e) => setSendViaWhatsapp(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  <MessageCircle className="h-3.5 w-3.5" /> Also send through my WhatsApp Business
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {selectedWithPhone} of {selectedLeads.length} selected have a phone number. Free-text
                  messages only reach people who messaged you in the last 24 hours, and sends are limited
                  to 20 per minute. Anything that fails is recorded as failed, never as sent.
                </span>
              </span>
            </label>
          ) : (
            <p className="flex items-start gap-2 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No working WhatsApp connection on your account, so nothing will be delivered externally.
                Each share is still recorded in the CRM. Use Copy or Share PDF to send it yourself.
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
        <div className="flex items-center gap-2">
          {onSharePdf && (
            <Button type="button" variant="outline" size="sm" onClick={onSharePdf}>
              <FileText className="h-3.5 w-3.5" /> Share PDF
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={share.isPending || selectedLeads.length === 0}
            onClick={handleShare}
          >
            {share.isPending
              ? "Sharing..."
              : willSendWhatsapp
                ? `Record and send (${selectedLeads.length})`
                : `Record share (${selectedLeads.length})`}
          </Button>
        </div>
      </div>
    </DrawerShell>
  );
}
