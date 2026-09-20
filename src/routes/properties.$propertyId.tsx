import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft, Pencil, Trash2, Share2, FileText, Sparkles } from "lucide-react";
import { useProspectsForProperty, useSimilarProperties } from "@/hooks/use-matching";
import { openPropertyPdf, sharePropertyPdf } from "@/lib/property-pdf";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PropertyDrawer } from "@/components/property-drawer";
import { MapboxPicker } from "@/components/mapbox-picker";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvailabilityRing } from "@/components/status-badge";
import { PropertyPublicationDestinations } from "@/components/property-publication-destinations";
import { PropertyAvailabilityConfirmation } from "@/components/property-availability-confirmation";
import { PropertyLeadsSection } from "@/components/property-leads-section";
import { SharePropertyDrawer } from "@/components/share-property-drawer";
import { PropertySharesSection } from "@/components/share-history";
import { useProperty, usePropertyMedia, useDeleteProperty, useSetHeroMedia, useReorderPropertyMedia } from "@/hooks/use-properties";
import { sb, fmtMoney, isConfirmationOverdue } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { propertyKeys } from "@/hooks/use-properties";
import { useDeleteUpload, getSignedPreviewUrl } from "@/hooks/use-uploads";
import { useRecordPropertyEvent } from "@/hooks/use-property-events";
import { usePropertyReferences } from "@/hooks/use-references";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtDate } from "@/lib/db";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { titleCase } from "@/lib/utils";

export const Route = createFileRoute("/properties/$propertyId")({
  head: () => ({ meta: [{ title: "Property Details" }] }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const { data: property, isLoading } = useProperty(propertyId);
  const { data: media = [] } = usePropertyMedia(propertyId);
  const { data: team = [] } = useTeamMembers();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const qc = useQueryClient();
  const deleteUpload = useDeleteUpload();
  const deleteProperty = useDeleteProperty();
  const setHeroMedia = useSetHeroMedia();
  const reorderMedia = useReorderPropertyMedia();
  const recordEvent = useRecordPropertyEvent();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const canHardDelete = can("properties", "hard_delete");
  const canUpload = can("uploads", "upload");
  const canDeleteUpload = can("uploads", "delete");

  async function handleShare() {
    if (!property) return;
    const agent = team.find((m) => m.id === property.assigned_agent_id);
    try {
      const result = await sharePropertyPdf(
        property,
        undefined,
        agent ? { full_name: agent.full_name, email: agent.email, phone: agent.phone } : null,
      );
      if (result === "downloaded") toast.success("PDF downloaded - share it from your downloads");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

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

  if (isLoading)
    return (
      <AppShell>
        <EmptyState title="Loading..." />
      </AppShell>
    );
  if (!property)
    return (
      <AppShell>
        <EmptyState title="Property not found" />
      </AppShell>
    );

  return (
    <AppShell>
      <PermissionGate module="properties" action="view" page>
        <Link
          to="/properties"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All properties
        </Link>

        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{property.title}</h2>
                <AvailabilityRing
                  availability={property.availability}
                  needsConfirmation={isConfirmationOverdue(property)}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {property.reference_code ? `${property.reference_code} · ` : ""}
                {property.property_type ?? "-"} · {property.location ?? "-"}
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {fmtMoney(property.price, property.currency)}
              </p>
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
              <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              {canHardDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <h4 className="text-sm font-semibold">Specifications</h4>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">Bedrooms</dt>
              <dd>{property.bedrooms ?? "-"}</dd>
              <dt className="text-muted-foreground">Bathrooms</dt>
              <dd>{property.bathrooms ?? "-"}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{property.size ? `${property.size} ${property.size_unit ?? ""}` : "-"}</dd>
              <dt className="text-muted-foreground">Developer</dt>
              <dd>{property.developer ?? "-"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{property.completion_status ?? "-"}</dd>
              <dt className="text-muted-foreground">Available from</dt>
              <dd>{property.available_from ? fmtDate(property.available_from) : "-"}</dd>
              {property.property_type === "Apartment" && (
                <>
                  <dt className="text-muted-foreground">Maid's room</dt>
                  <dd>{property.maids_room == null ? "-" : property.maids_room ? "Yes" : "No"}</dd>
                </>
              )}
              {property.property_type === "Villa" && (
                <>
                  <dt className="text-muted-foreground">Parking spaces</dt>
                  <dd>{property.parking_spaces ?? "-"}</dd>
                  <dt className="text-muted-foreground">Majlis</dt>
                  <dd>{property.majlis == null ? "-" : property.majlis ? "Yes" : "No"}</dd>
                  <dt className="text-muted-foreground">Indoor majlis</dt>
                  <dd>
                    {property.indoor_majlis == null ? "-" : property.indoor_majlis ? "Yes" : "No"}
                  </dd>
                  <dt className="text-muted-foreground">Outdoor majlis</dt>
                  <dd>
                    {property.outdoor_majlis == null ? "-" : property.outdoor_majlis ? "Yes" : "No"}
                  </dd>
                </>
              )}
            </dl>
          </Card>
          <Card>
            <h4 className="text-sm font-semibold">Amenities</h4>
            {property.amenities?.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {property.amenities.map((a) => (
                  <li key={a} className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No amenities listed.</p>
            )}
          </Card>
          {property.description && (
            <Card className="md:col-span-2">
              <h4 className="text-sm font-semibold">Description</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {property.description}
              </p>
            </Card>
          )}
          <Card className="md:col-span-2">
            <h4 className="text-sm font-semibold">Location</h4>
            <MapboxPicker
              latitude={property.latitude}
              longitude={property.longitude}
              readOnly
              className="mt-3 h-48"
            />
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
              {media.map((m, index) => {
                const row = m as unknown as {
                  id: string;
                  is_hero: boolean;
                  display_order: number;
                  uploads: {
                    id: string;
                    filename: string;
                    storage_bucket: string;
                    storage_path: string;
                    public_url: string | null;
                  } | null;
                };
                return (
                  <MediaThumb
                    key={row.id}
                    upload={row.uploads}
                    isHero={row.is_hero}
                    canDelete={canDeleteUpload}
                    canEdit={canEdit}
                    canMoveUp={index > 0}
                    canMoveDown={index < media.length - 1}
                    onSetHero={() => {
                      if (!row.uploads) return;
                      setHeroMedia.mutate(
                        { propertyId, mediaId: row.id, imageUrl: row.uploads.public_url },
                        {
                          onSuccess: () => toast.success("Hero image updated"),
                          onError: (e) => toast.error((e as Error).message),
                        },
                      );
                    }}
                    onMove={(direction) => {
                      const swapWith = media[index + direction] as unknown as { id: string; display_order: number } | undefined;
                      if (!swapWith) return;
                      reorderMedia.mutate(
                        {
                          propertyId,
                          items: [
                            { id: row.id, display_order: swapWith.display_order },
                            { id: swapWith.id, display_order: row.display_order },
                          ],
                        },
                        { onError: (e) => toast.error((e as Error).message) },
                      );
                    }}
                    onDelete={async () => {
                      const u = row.uploads;
                      if (!u) return;
                      try {
                        await deleteUpload.mutateAsync(u as never);
                        await sb.from("property_media").delete().eq("id", row.id);
                        qc.invalidateQueries({ queryKey: propertyKeys.media(propertyId) });
                        qc.invalidateQueries({ queryKey: propertyKeys.all });
                        toast.success("Removed");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                );
              })}
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

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <PropertyPublicationDestinations property={property} />
          <PropertyAvailabilityConfirmation property={property} />
        </div>

        <PropertyLeadsSection propertyId={propertyId} />
        <PropertySharesSection propertyId={propertyId} />
        <PropertyReferences propertyId={propertyId} />
        <PropertyMatches propertyId={propertyId} />

        <PropertyDrawer open={editOpen} onOpenChange={setEditOpen} property={property} />
        <SharePropertyDrawer
          open={shareOpen}
          onOpenChange={setShareOpen}
          property={property}
          onSharePdf={handleShare}
        />
        <ConfirmDialog
          open={confirmDelete}
          title="Permanently delete property?"
          description={`Delete ${property.title}. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          pending={deleteProperty.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteProperty.mutateAsync(property.id);
              toast.success("Property deleted");
              navigate({ to: "/properties" });
            } catch (e) {
              toast.error((e as Error).message);
            }
            setConfirmDelete(false);
          }}
        />
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
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
                >
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: lead.id }}
                    className="hover:underline"
                  >
                    {lead.full_name}
                  </Link>
                  <span className="text-muted-foreground capitalize">
                    {it.interest_level ?? it.status ?? "interested"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h4 className="text-sm font-semibold">Supporting conversations</h4>
        {interactions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Not mentioned in any conversation yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {interactions.slice(0, 15).map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
              >
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: i.lead_id }}
                  className="hover:underline"
                >
                  {titleCase(i.interaction_type)} with {i.leads?.full_name ?? "lead"}
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
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> Matching prospects
          </h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Deterministic match on purpose, location, type, budget and development - no AI required.
          </p>
          <ul className="mt-3 space-y-2">
            {prospects.map((p) => (
              <MatchRowLead
                key={p.lead_id}
                leadId={p.lead_id}
                score={p.score}
                reasons={p.reasons}
              />
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
                <Link
                  to="/properties/$propertyId"
                  params={{ propertyId: s.property_id }}
                  className="hover:underline font-medium"
                >
                  View property
                </Link>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.reasons.join(", ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MatchRowLead({
  leadId,
  score,
  reasons,
}: {
  leadId: string;
  score: number;
  reasons: string[];
}) {
  return (
    <li className="rounded-md border border-border p-2 text-xs">
      <div className="flex items-center justify-between">
        <Link to="/leads/$leadId" params={{ leadId }} className="hover:underline font-medium">
          Open lead
        </Link>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">score {score}</span>
      </div>
      {reasons.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">{reasons.join(", ")}</p>
      )}
    </li>
  );
}

function MediaThumb({
  upload,
  isHero,
  onDelete,
  onSetHero,
  onMove,
  canDelete,
  canEdit,
  canMoveUp,
  canMoveDown,
}: {
  upload?: { id: string; filename: string; storage_bucket: string; storage_path: string; public_url?: string | null } | null;
  isHero?: boolean;
  onDelete: () => void;
  onSetHero?: () => void;
  onMove?: (direction: -1 | 1) => void;
  canDelete: boolean;
  canEdit?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!upload) return;
    if (upload.public_url) {
      setUrl(upload.public_url);
      return;
    }
    getSignedPreviewUrl(upload as never).then(setUrl);
  }, [upload]);

  if (!upload) return null;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-background aspect-square">
      {url ? (
        <img src={url} alt={upload.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          {upload.filename}
        </div>
      )}
      {isHero && (
        <span className="absolute left-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
          Hero
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 hidden items-center justify-between gap-1 bg-black/60 px-2 py-1.5 group-hover:flex">
        {canEdit && onSetHero && !isHero ? (
          <button
            onClick={onSetHero}
            className="rounded-md bg-white/95 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-white"
          >
            Set as hero
          </button>
        ) : (
          <span />
        )}
        {onMove && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMove(-1)}
              disabled={!canMoveUp}
              aria-label="Move left"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white disabled:opacity-40"
            >
              ‹
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={!canMoveDown}
              aria-label="Move right"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-foreground hover:bg-white disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </div>
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
