import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { UploadDropzone } from "@/components/upload-dropzone";
import { usePermissions } from "@/hooks/use-auth";
import { useTeamMembers } from "@/hooks/use-team";
import { useMarketingRequests, useUpdateMarketingRequest } from "@/hooks/use-marketing-requests";
import { usePropertyMedia } from "@/hooks/use-properties";
import { sb } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { propertyKeys } from "@/hooks/use-properties";

export const Route = createFileRoute("/marketing")({
  head: () => ({ meta: [{ title: "Marketing" }] }),
  component: MarketingPage,
});

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

function MarketingPage() {
  const [status, setStatus] = useState<string>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: requests = [] } = useMarketingRequests(status === "all" ? null : (status as any));
  const { data: team = [] } = useTeamMembers();
  const update = useUpdateMarketingRequest();
  const { can } = usePermissions();
  const canAssign = can("marketing", "assign");
  const canComplete = can("marketing", "complete");
  const canUpload = can("marketing", "upload") || can("uploads", "upload");

  return (
    <AppShell>
      <PermissionGate module="marketing" action="view" page>
        <PageHeader
          eyebrow="Operations"
          title="Marketing"
          description="Properties missing required photos, and the media requests to fix them."
        />
        <div className="mb-4 flex items-center gap-2">
          <SelectField value={status} onChange={(v) => setStatus(v ?? "pending")} options={STATUS_OPTIONS} allowClear={false} className="w-44" />
        </div>

        {requests.length === 0 ? (
          <EmptyState icon={<Camera className="h-4 w-4" />} title="No requests" description="Properties without a hero image automatically appear here." />
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const p = r.properties;
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link to="/properties/$propertyId" params={{ propertyId: p?.id ?? "" }} className="text-sm font-medium hover:underline">
                          {p?.reference_code ? `${p.reference_code} · ` : ""}{p?.title ?? "Property"}
                        </Link>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">{r.status.replace(/_/g, " ")}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p?.property_type ?? "-"} · {p?.developments?.name ?? "-"} · {p?.areas?.name ?? "-"} · {p?.status ?? "-"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Required: {r.required_media}</p>
                      {r.notes && <p className="mt-1 text-xs text-muted-foreground">Notes: {r.notes}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Assigned: {team.find((t) => t.id === r.assigned_to)?.full_name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canAssign && (
                        <SearchableSelectField
                          value={r.assigned_to}
                          onChange={(v) => update.mutate({ id: r.id, patch: { assigned_to: v, status: r.status === "pending" ? "in_progress" : r.status } })}
                          options={team.map((m) => ({ value: m.id, label: m.full_name }))}
                          placeholder="Assign to..."
                          searchPlaceholder="Search team..."
                        />
                      )}
                      {r.status !== "completed" && canComplete && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await update.mutateAsync({ id: r.id, patch: { status: "completed", resolved_at: new Date().toISOString() } });
                              toast.success("Marked completed");
                            } catch (e) { toast.error((e as Error).message); }
                          }}
                        >
                          Mark Completed
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setExpanded((v) => (v === r.id ? null : r.id))}>
                        <ImageIcon className="h-3.5 w-3.5" /> {expanded === r.id ? "Hide media" : "Upload media"}
                      </Button>
                    </div>
                  </div>
                  {expanded === r.id && p && <RequestMediaPanel propertyId={p.id} canUpload={canUpload} />}
                </Card>
              );
            })}
          </div>
        )}
      </PermissionGate>
    </AppShell>
  );
}

function RequestMediaPanel({ propertyId, canUpload }: { propertyId: string; canUpload: boolean }) {
  const { data: media = [] } = usePropertyMedia(propertyId);
  const qc = useQueryClient();

  async function handleUploaded(uploadId: string) {
    const { error } = await sb.from("property_media").insert({
      property_id: propertyId,
      upload_id: uploadId,
      media_type: "image",
      display_order: media.length,
    });
    if (error) {
      toast.error(error.message);
    } else {
      qc.invalidateQueries({ queryKey: propertyKeys.media(propertyId) });
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      toast.success("Photo added - request will auto-resolve");
    }
  }

  async function handleSetHero(url: string) {
    const { error } = await sb.from("properties").update({ hero_image_url: url }).eq("id", propertyId);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: propertyKeys.all }); toast.success("Hero image set"); }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {canUpload && (
        <UploadDropzone title="Upload property photos" description="JPG, PNG, or WEBP." categoryKey="property_media" propertyId={propertyId} onUploaded={handleUploaded} />
      )}
      {media.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {media.map((m: any) => {
            const u = m.uploads;
            if (!u) return null;
            const { data: pub } = sb.storage.from(u.storage_bucket).getPublicUrl(u.storage_path);
            return (
              <button key={m.id} type="button" className="group relative aspect-square overflow-hidden rounded-md border border-border" onClick={() => handleSetHero(pub.publicUrl)} title="Set as hero image">
                <img src={pub.publicUrl} alt={u.filename} className="h-full w-full object-cover" />
                <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-[10px] text-white group-hover:flex">Set as hero</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
