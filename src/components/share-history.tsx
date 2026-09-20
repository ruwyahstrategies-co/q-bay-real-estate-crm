import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { Card } from "./ui-primitives";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/db";
import {
  SHARE_STATUS_LABELS,
  useLeadPropertyShares,
  usePropertyShares,
  type PropertyShareRow,
} from "@/hooks/use-property-shares";

function StatusPill({ share }: { share: PropertyShareRow }) {
  return (
    <span
      title={share.delivery_error ?? undefined}
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px]",
        share.status === "sent" && "bg-pastel-green",
        share.status === "failed" && "bg-destructive/10 text-destructive",
        share.status === "recorded" && "bg-muted text-muted-foreground",
      )}
    >
      {SHARE_STATUS_LABELS[share.status] ?? share.status}
    </span>
  );
}

/** Property page: which leads this property has been shared with. */
export function PropertySharesSection({ propertyId }: { propertyId: string }) {
  const { data: shares = [], isLoading } = usePropertyShares(propertyId);
  if (isLoading) return null;
  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Shared with leads{shares.length ? ` (${shares.length})` : ""}</h4>
      </div>
      {shares.length === 0 ? (
        <EmptyState
          compact
          title="Not shared with any lead yet"
          description="Use Share to send this property to one or more leads. Each share is recorded here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                {s.leads ? (
                  <Link to="/leads/$leadId" params={{ leadId: s.leads.id }} className="font-medium hover:underline">
                    {s.leads.full_name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Lead</span>
                )}
                <span className="ml-2 text-muted-foreground">
                  {fmtDateTime(s.shared_at)}
                  {s.team_members?.full_name ? ` by ${s.team_members.full_name}` : ""}
                </span>
              </div>
              <StatusPill share={s} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Lead page: which properties have been shared with this lead. */
export function LeadSharedPropertiesSection({ leadId }: { leadId: string }) {
  const { data: shares = [], isLoading } = useLeadPropertyShares(leadId);
  if (isLoading) return null;
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Properties shared{shares.length ? ` (${shares.length})` : ""}</h4>
      </div>
      {shares.length === 0 ? (
        <p className="text-xs text-muted-foreground">No properties have been shared with this lead yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shares.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                {s.properties ? (
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: s.properties.id }}
                    className="font-medium hover:underline"
                  >
                    {s.properties.reference_code ? `${s.properties.reference_code} · ` : ""}
                    {s.properties.title}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Property</span>
                )}
                <span className="ml-2 text-muted-foreground">
                  {fmtDateTime(s.shared_at)}
                  {s.team_members?.full_name ? ` by ${s.team_members.full_name}` : ""}
                </span>
              </div>
              <StatusPill share={s} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
