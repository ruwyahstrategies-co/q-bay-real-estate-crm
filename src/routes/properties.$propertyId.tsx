import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft, Pencil, Trash2, FileText, Sparkles } from "lucide-react";
import { useProspectsForProperty, useSimilarProperties } from "@/hooks/use-matching";
import { openPropertyPdf } from "@/lib/property-pdf";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PropertyDrawer } from "@/components/property-drawer";
import { MapboxPicker } from "@/components/mapbox-picker";
import { UploadDropzone } from "@/components/upload-dropzone";
import { useProperty, usePropertyMedia } from "@/hooks/use-properties";
import { sb, fmtMoney } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { propertyKeys } from "@/hooks/use-properties";
import { useDeleteUpload, getSignedPreviewUrl } from "@/hooks/use-uploads";
import { useRecordPropertyEvent } from "@/hooks/use-property-events";
import { usePropertyReferences } from "@/hooks/use-references";
import { fmtDate } from "@/lib/db";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";

export const Route = createFileRoute("/properties/$propertyId")({
  head: () => ({ meta: [{ title: "Property Details" }] }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const { data: property, isLoading } = useProperty(propertyId);
  const { data: media = [] } = usePropertyMedia(propertyId);
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const deleteUpload = useDeleteUpload();
  const recordEvent = useRecordPropertyEvent();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const canUpload = can("uploads", "upload");
  const canDeleteUpload = can("uploads", "delete");

  // Record a 'view' event once per session per day per property
  useEffect(() => {
    if (!propertyId || typeof window === "undefined") return;
    const key = `prop-view:${propertyId}:${new Date().toDateString()}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      recordEvent.mutate({ property_id: propertyId, event_type: "view", source: "web" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function handleMediaUploaded(uploadId: string) {
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
    }
  }

  if (isLoading) return <AppShell><EmptyState title="Loading..." /></AppShell>;
  if (!property) return <AppShell><EmptyState title="Property not found" /></AppShell>;

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
      <Link to="/properties" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> All properties
      </Link>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{property.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {property.reference_code ? `${property.reference_code} · ` : ""}
              {property.property_type ?? "-"} · {property.location ?? "-"}
            </p>
            <p className="mt-3 text-2xl font-semibold">{fmtMoney(property.price, property.currency)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openPropertyPdf(property)}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <h4 className="text-sm font-semibold">Specifications</h4>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <dt className="text-muted-foreground">Bedrooms</dt><dd>{property.bedrooms ?? "-"}</dd>
            <dt className="text-muted-foreground">Bathrooms</dt><dd>{property.bathrooms ?? "-"}</dd>
            <dt className="text-muted-foreground">Size</dt><dd>{property.size ? `${property.size} ${property.size_unit ?? ""}` : "-"}</dd>
            <dt className="text-muted-foreground">Developer</dt><dd>{property.developer ?? "-"}</dd>
            <dt className="text-muted-foreground">Status</dt><dd>{property.completion_status ?? "-"}</dd>
            <dt className="text-muted-foreground">Availability</dt><dd className="capitalize">{property.availability}</dd>
          </dl>
        </Card>
        <Card>
          <h4 className="text-sm font-semibold">Amenities</h4>
          {property.amenities?.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {property.amenities.map((a) => (
                <li key={a} className="rounded-full bg-muted px-2.5 py-1 text-[11px]">{a}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No amenities listed.</p>
          )}
        </Card>
        {property.description && (
          <Card className="md:col-span-2">
            <h4 className="text-sm font-semibold">Description</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{property.description}</p>
          </Card>
        )}
        <Card className="md:col-span-2">
          <h4 className="text-sm font-semibold">Location</h4>
          <MapboxPicker latitude={property.latitude} longitude={property.longitude} readOnly className="mt-3 h-48" />
        </Card>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-base font-semibold">Media</h3>
        {canUpload && (
          <UploadDropzone
            title="Upload property images"
            description="JPG, PNG, or WEBP."
            categoryKey="property_media"
            propertyId={propertyId}
            onUploaded={handleMediaUploaded}
          />
        )}
        {media.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {media.map((m) => (
              <MediaThumb
                key={m.id}
                upload={(m as unknown as { uploads: { id: string; filename: string; storage_bucket: string; storage_path: string } }).uploads}
                canDelete={canDeleteUpload}
                onDelete={async () => {
                  const u = (m as unknown as { uploads: { id: string; storage_bucket: string; storage_path: string; filename: string } }).uploads;
                  if (!u) return;
                  try {
                    await deleteUpload.mutateAsync(u as never);
                    await sb.from("property_media").delete().eq("id", m.id);
                    qc.invalidateQueries({ queryKey: propertyKeys.media(propertyId) });
                    qc.invalidateQueries({ queryKey: propertyKeys.all });
                    toast.success("Removed");
                  } catch (e) { toast.error((e as Error).message); }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {canUpload && (
        <div className="mt-6">
          <h3 className="mb-3 text-base font-semibold">Brochures & documents</h3>
          <UploadDropzone
            title="Upload brochures or floor plans"
            categoryKey="brochures"
            propertyId={propertyId}
          />
        </div>
      )}

      <PropertyReferences propertyId={propertyId} />
      <PropertyMatches propertyId={propertyId} />

      <PropertyDrawer open={editOpen} onOpenChange={setEditOpen} property={property} />
      </PermissionGate>
    </AppShell>
  );
}

function PropertyReferences({ propertyId }: { propertyId: string }) {
  const { data } = usePropertyReferences(propertyId);
  const interests = (data?.interests ?? []) as any[];
  const interactions = (data?.interactions ?? []) as any[];
  if (interests.length === 0 && interactions.length === 0) return null;
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card>
        <h4 className="text-sm font-semibold">Interested leads</h4>
        {interests.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No leads linked yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {interests.map((it) => {
              const lead = it.leads;
              if (!lead) return null;
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                  <Link to="/leads/$leadId" params={{ leadId: lead.id }} className="hover:underline">{lead.full_name}</Link>
                  <span className="text-muted-foreground capitalize">{it.interest_level ?? it.status ?? "interested"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h4 className="text-sm font-semibold">Supporting conversations</h4>
        {interactions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Not mentioned in any conversation yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {interactions.slice(0, 15).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                <Link to="/leads/$leadId" params={{ leadId: i.lead_id }} className="hover:underline">
                  {i.interaction_type.replace(/_/g," ")} with {i.leads?.full_name ?? "lead"}
                </Link>
                <span className="text-muted-foreground">{fmtDate(i.interaction_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PropertyMatches({ propertyId }: { propertyId: string }) {
  const { data: prospects = [] } = useProspectsForProperty(propertyId);
  const { data: similar = [] } = useSimilarProperties(propertyId);
  if (prospects.length === 0 && similar.length === 0) return null;
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
      {prospects.length > 0 && (
        <Card>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-3.5 w-3.5" /> Matching prospects</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">Deterministic match on purpose, location, type, budget and development - no AI required.</p>
          <ul className="mt-3 space-y-2">
            {prospects.map((p) => (
              <MatchRowLead key={p.lead_id} leadId={p.lead_id} score={p.score} reasons={p.reasons} />
            ))}
          </ul>
        </Card>
      )}
      {similar.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold">Similar properties</h4>
          <ul className="mt-3 space-y-2">
            {similar.map((s) => (
              <li key={s.property_id} className="rounded-md border border-border p-2 text-xs">
                <Link to="/properties/$propertyId" params={{ propertyId: s.property_id }} className="hover:underline font-medium">View property</Link>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.reasons.join(", ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MatchRowLead({ leadId, score, reasons }: { leadId: string; score: number; reasons: string[] }) {
  return (
    <li className="rounded-md border border-border p-2 text-xs">
      <div className="flex items-center justify-between">
        <Link to="/leads/$leadId" params={{ leadId }} className="hover:underline font-medium">Open lead</Link>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">score {score}</span>
      </div>
      {reasons.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{reasons.join(", ")}</p>}
    </li>
  );
}

function MediaThumb({
  upload,
  onDelete,
  canDelete,
}: {
  upload?: { id: string; filename: string; storage_bucket: string; storage_path: string } | null;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!upload) return;
    getSignedPreviewUrl(upload as never).then(setUrl);
  }, [upload]);

  if (!upload) return null;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-background aspect-square">
      {url ? (
        <img src={url} alt={upload.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{upload.filename}</div>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
