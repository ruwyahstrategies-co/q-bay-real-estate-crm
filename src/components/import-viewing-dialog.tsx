import { useState } from "react";
import { X, Import } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField } from "./select-field";
import { sb, type Viewing } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn, titleCase } from "@/lib/utils";

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Destination = "lead_note" | "lead_requirements" | "property_feedback" | "follow_up" | "offer_interest" | "property_issue" | "owner_notes";

const DESTINATIONS: { key: Destination; label: string; description: string }[] = [
  { key: "lead_note", label: "Lead Notes", description: "Adds a new note on the lead (kept as history, never overwrites)." },
  { key: "lead_requirements", label: "Lead Requirements", description: "Appends to the lead's requirements/notes field." },
  { key: "property_feedback", label: "Property Feedback", description: "Logs an interaction against the property." },
  { key: "follow_up", label: "Follow-Up", description: "Creates a follow-up task for the lead." },
  { key: "offer_interest", label: "Offer/Interest", description: "Records the lead's interest in this property." },
  { key: "property_issue", label: "Property Issue", description: "Creates a maintenance/issue task for the property." },
  { key: "owner_notes", label: "Owner/Property Notes", description: "Logs an interaction against the property's owner." },
];

export function ImportViewingDialog({ open, onOpenChange, viewing }: { open: boolean; onOpenChange: (v: boolean) => void; viewing: Viewing & { leads?: { full_name: string } | null; properties?: { title: string } | null } }) {
  const { teamMember } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState(viewing.notes ?? "");
  const [selected, setSelected] = useState<Set<Destination>>(new Set());
  const [followUpDue, setFollowUpDue] = useState("");
  const [interestLevel, setInterestLevel] = useState("interested");
  const [saving, setSaving] = useState(false);

  const { data: property } = useQuery({
    queryKey: ["viewing-import-property", viewing.property_id ?? "none"],
    enabled: !!viewing.property_id,
    queryFn: async () => {
      const { data } = await sb.from("properties").select("id, owner_id, title").eq("id", viewing.property_id!).maybeSingle();
      return data;
    },
  });

  function toggle(key: Destination) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleImport() {
    if (selected.size === 0) return toast.error("Select at least one destination");
    if (!text.trim()) return toast.error("Nothing to import - the text is empty");
    setSaving(true);
    const results: string[] = [];
    const dateLabel = new Date(viewing.scheduled_at).toLocaleDateString();
    try {
      if (selected.has("lead_note") && viewing.lead_id) {
        const { error } = await sb.from("lead_notes").insert({ lead_id: viewing.lead_id, content: `From viewing on ${dateLabel}:\n${text.trim()}`, author_id: teamMember?.id ?? null });
        if (error) throw error;
        results.push("Lead note added");
      }
      if (selected.has("lead_requirements") && viewing.lead_id) {
        const { data: lead } = await sb.from("leads").select("notes").eq("id", viewing.lead_id).maybeSingle();
        const appended = `${lead?.notes ? lead.notes + "\n\n" : ""}From viewing on ${dateLabel}:\n${text.trim()}`;
        const { error } = await sb.from("leads").update({ notes: appended }).eq("id", viewing.lead_id);
        if (error) throw error;
        results.push("Lead requirements updated");
      }
      if (selected.has("property_feedback") && viewing.property_id) {
        const { error } = await sb.from("interactions").insert({
          property_id: viewing.property_id, lead_id: viewing.lead_id, interaction_type: "manual_note",
          subject: "Viewing feedback", content: text.trim(), created_by: null,
        });
        if (error) throw error;
        results.push("Property feedback logged");
      }
      if (selected.has("follow_up") && viewing.lead_id) {
        const { error } = await sb.from("tasks").insert({
          title: `Follow up after viewing (${dateLabel})`, description: text.trim(), lead_id: viewing.lead_id,
          property_id: viewing.property_id, assigned_to: viewing.assigned_agent_id, task_type: "follow_up",
          due_at: followUpDue ? new Date(followUpDue).toISOString() : null,
        });
        if (error) throw error;
        results.push("Follow-up task created");
      }
      if (selected.has("offer_interest") && viewing.lead_id && viewing.property_id) {
        const { error } = await sb.from("lead_property_interests").insert({
          lead_id: viewing.lead_id, property_id: viewing.property_id, interest_level: interestLevel, notes: text.trim(),
        });
        if (error) throw error;
        results.push("Offer/interest recorded");
      }
      if (selected.has("property_issue") && viewing.property_id) {
        const { error } = await sb.from("tasks").insert({
          title: `Property issue noted during viewing (${dateLabel})`, description: text.trim(),
          property_id: viewing.property_id, task_type: "maintenance", assigned_to: viewing.assigned_agent_id,
        });
        if (error) throw error;
        results.push("Property issue task created");
      }
      if (selected.has("owner_notes")) {
        if (!property?.owner_id) {
          toast.error("This property has no linked owner - skipped Owner/Property Notes");
        } else {
          const { error } = await sb.from("interactions").insert({
            owner_id: property.owner_id, property_id: viewing.property_id, interaction_type: "manual_note",
            subject: "Note from viewing", content: text.trim(),
          });
          if (error) throw error;
          results.push("Owner note logged");
        }
      }

      qc.invalidateQueries();
      toast.success(results.length ? results.join(" · ") : "Nothing was imported");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Import viewing information">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Import from Viewing</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-xs text-muted-foreground">
          {viewing.leads?.full_name ?? "Lead"} · {viewing.properties?.title ?? "Property"} · {new Date(viewing.scheduled_at).toLocaleString()}
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Information to import (edit before saving)</span>
          <textarea className={cn(inputCls, "h-28 py-2")} value={text} onChange={(e) => setText(e.target.value)} />
        </label>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Send to</p>
          {DESTINATIONS.map((d) => {
            const disabled =
              ((d.key === "lead_note" || d.key === "lead_requirements" || d.key === "follow_up" || d.key === "offer_interest") && !viewing.lead_id) ||
              ((d.key === "property_feedback" || d.key === "property_issue") && !viewing.property_id) ||
              (d.key === "offer_interest" && !viewing.property_id) ||
              (d.key === "owner_notes" && !viewing.property_id);
            return (
              <label key={d.key} className={cn("flex items-start gap-2.5 rounded-lg border border-border p-2.5", disabled && "opacity-40")}>
                <input type="checkbox" className="mt-0.5" disabled={disabled} checked={selected.has(d.key)} onChange={() => toggle(d.key)} />
                <div>
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                </div>
              </label>
            );
          })}
        </div>

        {selected.has("follow_up") && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Follow-up due date</span>
            <input className={inputCls} type="datetime-local" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} />
          </label>
        )}
        {selected.has("offer_interest") && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Interest level</span>
            <SelectField
              value={interestLevel}
              onChange={(v) => setInterestLevel(v ?? "interested")}
              options={["interested", "very_interested", "considering", "not_interested"].map((l) => ({ value: l, label: titleCase(l) }))}
              allowClear={false}
            />
          </label>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border p-5">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button size="sm" disabled={saving} onClick={handleImport}>
          <Import className="h-3.5 w-3.5" /> {saving ? "Importing..." : "Import"}
        </Button>
      </div>
    </DrawerShell>
  );
}
