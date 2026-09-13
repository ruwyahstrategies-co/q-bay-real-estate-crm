import { Link } from "@tanstack/react-router";
import { Users2 } from "lucide-react";
import { Card } from "./ui-primitives";
import { PipelineStageBadge, IntentScore } from "./status-badge";
import { EmptyState } from "./empty-state";
import { usePropertyLeads } from "@/hooks/use-references";
import { effectiveIntentScore } from "@/lib/intent";
import { LEAD_CLASSIFICATION_LABELS, fmtDate, stageLabel } from "@/lib/db";

function outcomeFor(pipelineStage: string, status: string): { label: string; tone: string } {
  if (pipelineStage === "won") return { label: "Won", tone: "text-emerald-600" };
  if (pipelineStage === "lost" || status === "lost")
    return { label: "Lost", tone: "text-destructive" };
  if (status !== "active") return { label: status, tone: "text-muted-foreground" };
  return { label: "Active", tone: "text-foreground" };
}

/** Every Lead connected to this Property - via interest, viewing or offer - in one place, opened directly from here. */
export function PropertyLeadsSection({ propertyId }: { propertyId: string }) {
  const { data: rows = [], isLoading } = usePropertyLeads(propertyId);

  if (isLoading) return null;
  if (rows.length === 0) {
    return (
      <Card className="mt-6">
        <div className="mb-1 flex items-center gap-2">
          <Users2 className="h-4 w-4" />
          <h4 className="text-sm font-semibold">Leads</h4>
        </div>
        <EmptyState
          compact
          title="No leads linked yet"
          description="Leads who view, enquire about, view, or offer on this property will appear here."
        />
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Users2 className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Leads ({rows.length})</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Lead</th>
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Agent</th>
              <th className="pb-2 pr-3 font-medium">Intent</th>
              <th className="pb-2 pr-3 font-medium">Stage</th>
              <th className="pb-2 pr-3 font-medium">Interest</th>
              <th className="pb-2 pr-3 font-medium">Latest interaction</th>
              <th className="pb-2 pr-3 font-medium">Viewing / Offer</th>
              <th className="pb-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const outcome = outcomeFor(r.pipeline_stage, r.status);
              const effective =
                r.base_intent_score != null ? effectiveIntentScore(r.base_intent_score, r) : null;
              return (
                <tr key={r.lead_id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: r.lead_id }}
                      className="font-medium hover:underline"
                    >
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 capitalize">
                    {r.classification
                      ? (LEAD_CLASSIFICATION_LABELS[r.classification] ?? r.classification)
                      : "-"}
                  </td>
                  <td className="py-2 pr-3">{r.assigned_agent_name ?? "Unassigned"}</td>
                  <td className="py-2 pr-3">
                    <IntentScore score={effective} />
                  </td>
                  <td className="py-2 pr-3">
                    <PipelineStageBadge stage={stageLabel(r.pipeline_stage)} />
                  </td>
                  <td className="py-2 pr-3 capitalize">
                    {r.interest_level ?? r.interest_status ?? "-"}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {r.latest_interaction_at
                      ? `${r.latest_interaction_type?.replace(/_/g, " ") ?? ""} · ${fmtDate(r.latest_interaction_at)}`
                      : "-"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.has_viewing && (
                      <span className="mr-1.5 rounded-full bg-pastel-blue px-1.5 py-0.5 text-[10px] capitalize">
                        Viewing: {r.latest_viewing_status}
                      </span>
                    )}
                    {r.has_offer && (
                      <span className="rounded-full bg-pastel-purple px-1.5 py-0.5 text-[10px] capitalize">
                        Offer: {r.latest_offer_status}
                      </span>
                    )}
                    {!r.has_viewing && !r.has_offer && "-"}
                  </td>
                  <td className={`py-2 font-medium ${outcome.tone}`}>{outcome.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
