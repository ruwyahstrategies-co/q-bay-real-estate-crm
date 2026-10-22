import { useMemo, useState } from "react";
import { EmptyState } from "./empty-state";
import { InteractionAttachments } from "./interaction-attachments";
import { cn } from "@/lib/utils";
import { fmtQatarDateTime } from "@/lib/qatar-time";
import { buildLeadTimeline, TIMELINE_FILTERS, type TimelineCategory } from "@/lib/lead-timeline";
import { describeAssignmentEvent, useAssignmentEvents } from "./assignment-history";
import { useTeamMembers } from "@/hooks/use-team";
import { useInteractions } from "@/hooks/use-interactions";
import { useTasks } from "@/hooks/use-tasks";
import { useUploads } from "@/hooks/use-uploads";
import { usePipelineHistory } from "@/hooks/use-pipeline-history";
import { useLeadNotes } from "@/hooks/use-lead-notes";
import { useLeadViewings } from "@/hooks/use-viewings";
import { useLeadOffers } from "@/hooks/use-offers";
import { usePipelineStages, stageLabelFrom } from "@/hooks/use-pipeline-stages";
import type { Lead } from "@/lib/db";

const DOT: Record<TimelineCategory, string> = {
  contact: "bg-qbay",
  stage: "bg-foreground",
  handover: "bg-pastel-purple",
  task: "bg-pastel-blue",
  note: "bg-pastel-green",
  file: "bg-muted-foreground",
  viewing: "bg-pastel-blue",
  offer: "bg-pastel-green",
  lead: "bg-foreground",
};

/**
 * Everything recorded about a lead in one history: each contact attempt on its own, stage changes (corrections
 * and restarts are labelled), handovers, notes, tasks, files, viewings and offers. Each entry names who did it
 * and when, and conversations show the screenshots and files saved as evidence.
 */
export function LeadActivityTimeline({ lead }: { lead: Lead }) {
  const { data: team = [] } = useTeamMembers();
  const { data: stages = [] } = usePipelineStages({ activeOnly: false });
  const { data: history = [] } = usePipelineHistory(lead.id);
  const { data: interactions = [] } = useInteractions({ leadId: lead.id });
  const { data: tasks = [] } = useTasks({ leadId: lead.id });
  const { data: files = [] } = useUploads({ leadId: lead.id });
  const { data: notes = [] } = useLeadNotes(lead.id);
  const { data: viewings = [] } = useLeadViewings(lead.id);
  const { data: offers = [] } = useLeadOffers(lead.id);
  const { data: assignmentEvents = [] } = useAssignmentEvents("lead", lead.id);
  const [filter, setFilter] = useState<"all" | TimelineCategory>("all");

  const events = useMemo(() => {
    const memberName = (id: string | null | undefined) =>
      id ? (team.find((m) => m.id === id)?.full_name ?? null) : null;
    const userName = (id: string | null | undefined) =>
      id ? (team.find((m) => m.user_id === id)?.full_name ?? null) : null;
    const actorName = (id: string | null | undefined) => memberName(id) ?? userName(id);
    const agent = (id: string | null) => (id ? (memberName(id) ?? "a team member") : "Unassigned");

    const attachmentsByInteraction = new Map<string, string[]>();
    for (const f of files) {
      if (!f.interaction_id) continue;
      attachmentsByInteraction.set(f.interaction_id, [
        ...(attachmentsByInteraction.get(f.interaction_id) ?? []),
        f.id,
      ]);
    }

    return buildLeadTimeline({
      lead,
      actorName,
      stageLabel: (k) => stageLabelFrom(stages, k),
      history: history as never,
      interactions: interactions as never,
      attachmentsByInteraction,
      notes: notes as never,
      tasks: tasks as never,
      files: files as never,
      assignments: assignmentEvents.map((e) => {
        const d = describeAssignmentEvent(e, agent);
        return { id: e.id, created_at: e.created_at, title: d.title, detail: d.detail };
      }),
      viewings: (
        viewings as unknown as {
          id: string;
          scheduled_at: string;
          created_at: string;
          status: string;
          created_by: string | null;
          properties: { title: string } | null;
        }[]
      ).map((v) => ({
        id: v.id,
        scheduled_at: fmtQatarDateTime(v.scheduled_at),
        created_at: v.created_at,
        status: v.status,
        created_by: v.created_by,
        property_title: v.properties?.title ?? null,
      })),
      offers: offers as never,
    });
  }, [
    team,
    stages,
    history,
    interactions,
    tasks,
    files,
    notes,
    viewings,
    offers,
    assignmentEvents,
    lead,
  ]);

  const shown = filter === "all" ? events : events.filter((e) => e.category === filter);
  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const contacts = events.filter((e) => e.category === "contact").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Filter activity" className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === f.value
                  ? "border-qbay bg-qbay-tint text-qbay"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {events.length} entries, {contacts} contact{contacts === 1 ? "" : "s"}
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState compact title="No activity yet" />
      ) : (
        <ol className="space-y-2">
          {shown.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-canvas p-3"
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[e.category])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{e.title}</p>
                {e.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {e.detail}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {e.actor ? (
                    <span className="font-medium text-foreground">{e.actor}</span>
                  ) : (
                    <span>System</span>
                  )}
                  {e.stage ? <span> · in {e.stage}</span> : null}
                </p>
                {e.attachmentIds && e.attachmentIds.length > 0 && (
                  <InteractionAttachments
                    files={e.attachmentIds
                      .map((id) => fileById.get(id))
                      .filter((f): f is NonNullable<typeof f> => !!f)}
                  />
                )}
              </div>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {fmtQatarDateTime(e.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
