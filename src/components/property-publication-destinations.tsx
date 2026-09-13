import { useState } from "react";
import { toast } from "sonner";
import { Globe, ExternalLink } from "lucide-react";
import { Card, Button } from "./ui-primitives";
import { StatusBadge } from "./status-badge";
import { sb, PUBLICATION_DESTINATION_STATUS_LABELS, type Property } from "@/lib/db";
import { useUpdateProperty } from "@/hooks/use-properties";
import { usePermissions } from "@/hooks/use-auth";

type DestinationStatus = "not_configured" | "queued" | "published" | "failed" | "unpublished";

const STATUS_VARIANT: Record<DestinationStatus, "neutral" | "amber" | "green" | "red"> = {
  not_configured: "neutral",
  queued: "amber",
  published: "green",
  failed: "red",
  unpublished: "neutral",
};

/**
 * Three independent publication destinations. QBay's own visibility is the
 * existing is_published boolean (already editable in the Property drawer);
 * Mazad and Property Finder each get their own status here, driven by the
 * publish-property-destination Edge Function - never a single shared flag.
 */
export function PropertyPublicationDestinations({ property }: { property: Property }) {
  const { can } = usePermissions();
  const canPublish = can("properties", "publish");
  const update = useUpdateProperty();
  const [pending, setPending] = useState<"mazad" | "property_finder" | null>(null);

  async function toggleQBay() {
    try {
      await update.mutateAsync({
        id: property.id,
        patch: { is_published: !property.is_published },
      });
      toast.success(
        property.is_published ? "Unpublished from QBay website" : "Published to QBay website",
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function callDestination(
    destination: "mazad" | "property_finder",
    action: "publish" | "unpublish",
  ) {
    setPending(destination);
    try {
      const { data, error } = await sb.functions.invoke<{ ok: boolean; error?: string }>(
        "publish-property-destination",
        {
          body: { property_id: property.id, destination, action },
        },
      );
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || "Publishing failed");
      } else {
        toast.success(
          `${destination === "mazad" ? "Mazad Qatar" : "Property Finder"} ${action === "publish" ? "published" : "unpublished"}`,
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4" />
        <h4 className="text-sm font-semibold">Publication destinations</h4>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">QBay Website</p>
            <StatusBadge variant={property.is_published ? "green" : "neutral"} className="mt-1">
              {property.is_published ? "Published" : "Not published"}
            </StatusBadge>
          </div>
          {canPublish && (
            <Button variant="outline" size="sm" disabled={update.isPending} onClick={toggleQBay}>
              {property.is_published ? "Unpublish" : "Publish"}
            </Button>
          )}
        </div>

        <DestinationRow
          label="Mazad Qatar"
          status={property.mazad_status as DestinationStatus}
          error={property.mazad_error}
          syncedAt={property.mazad_synced_at}
          canPublish={canPublish}
          pending={pending === "mazad"}
          onPublish={() => callDestination("mazad", "publish")}
          onUnpublish={() => callDestination("mazad", "unpublish")}
        />
        <DestinationRow
          label="Property Finder"
          status={property.property_finder_status as DestinationStatus}
          error={property.property_finder_error}
          syncedAt={property.property_finder_synced_at}
          canPublish={canPublish}
          pending={pending === "property_finder"}
          onPublish={() => callDestination("property_finder", "publish")}
          onUnpublish={() => callDestination("property_finder", "unpublish")}
        />
      </div>
    </Card>
  );
}

function DestinationRow({
  label,
  status,
  error,
  syncedAt,
  canPublish,
  pending,
  onPublish,
  onUnpublish,
}: {
  label: string;
  status: DestinationStatus;
  error: string | null;
  syncedAt: string | null;
  canPublish: boolean;
  pending: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <StatusBadge variant={STATUS_VARIANT[status] ?? "neutral"} className="mt-1">
            {PUBLICATION_DESTINATION_STATUS_LABELS[status] ?? status}
          </StatusBadge>
        </div>
        {canPublish && (
          <div className="flex items-center gap-1.5">
            {status === "published" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={onUnpublish}>
                {pending ? "Working..." : "Unpublish"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={pending} onClick={onPublish}>
                {pending ? "Working..." : "Publish"}
              </Button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-1 text-[11px] text-destructive">
          <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" /> {error}
        </p>
      )}
      {syncedAt && !error && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last attempt {new Date(syncedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
