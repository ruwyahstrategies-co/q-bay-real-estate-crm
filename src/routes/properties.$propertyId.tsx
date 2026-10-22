import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft, Pencil, Trash2, Share2, FileText, Sparkles, BedDouble, Bath, Ruler, Mail, Phone } from "lucide-react";
import { useProspectsForProperty, useSimilarProperties } from "@/hooks/use-matching";
import { usePropertyBrochure } from "@/hooks/use-property-brochure";
import { isVillaType } from "@/lib/property-types";
import { PropertyMediaManager } from "@/components/property-media-manager";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PropertyDrawer } from "@/components/property-drawer";
import { MapboxPicker } from "@/components/mapbox-picker";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvailabilityRing, PurposeBadge } from "@/components/status-badge";
import { PropertyGallery, type GalleryImage, type GalleryUpload } from "@/components/property-gallery";
import { StaffAvatar } from "@/components/staff-avatar";
import { PropertyPublicationDestinations } from "@/components/property-publication-destinations";
import { PropertyAvailabilityConfirmation } from "@/components/property-availability-confirmation";
import { PropertyLeadsSection } from "@/components/property-leads-section";
import { PropertySalesSection } from "@/components/property-sales-section";
import { SharePropertyDrawer } from "@/components/share-property-drawer";
import { PropertyWebsiteLinkButtons } from "@/components/property-website-link";
import { PropertySharesSection } from "@/components/share-history";
import { PropertyApprovalPanel } from "@/components/property-approval-panel";
import { PropertyViewingsSection, PropertyTasksSection } from "@/components/property-related";
import { useProperty, usePropertyMedia, useDeleteProperty } from "@/hooks/use-properties";
import { fmtMoney, isConfirmationOverdue } from "@/lib/db";
import { useRecordPropertyEvent } from "@/hooks/use-property-events";
import { usePropertyReferences } from "@/hooks/use-references";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtDate } from "@/lib/db";
import { PermissionGate } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { titleCase } from "@/lib/utils";
import { DynamicFieldsView, type CustomFieldValues } from "@/components/dynamic-fields";

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
  const deleteProperty = useDeleteProperty();
  const recordEvent = useRecordPropertyEvent();
  const { can } = usePermissions();
  const canEdit = can("properties", "edit");
  const canHardDelete = can("properties", "hard_delete");
  const canUpload = can("uploads", "upload");
  const canDeleteUpload = can("uploads", "delete");

  const brochure = usePropertyBrochure();
  const advisor = team.find((m) => m.id === property?.assigned_agent_id);
  async function handleShare() {
    if (!property) return;
    await brochure.share(property.id, advisor);
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

  const galleryImages: GalleryImage[] = (
    media as unknown as {
      id: string;
      is_hero: boolean;
      media_type?: string | null;
      uploads: GalleryUpload | null;
    }[]
  )
    .filter((m) => m.uploads && (!m.media_type || m.media_type === "image"))
    .map((m) => ({ id: m.id, isHero: !!m.is_hero, upload: m.uploads as GalleryUpload }));
  const assignedAgent = team.find((m) => m.id === property?.assigned_agent_id) ?? null;

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

        <PropertyApprovalPanel property={property} />

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="p-3 lg:col-span-3">
            <PropertyGallery images={galleryImages} />
          </Card>

          <Card className="flex flex-col lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <PurposeBadge purpose={property.purpose} />
              <AvailabilityRing
                availability={property.availability}
                needsConfirmation={isConfirmationOverdue(property)}
              />
            </div>
            <h1 className="mt-3 text-xl font-semibold leading-snug tracking-tight">{property.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {property.reference_code ? `${property.reference_code} · ` : ""}
              {property.property_type ?? "-"} · {property.location ?? "-"}
            </p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">
              {fmtMoney(property.price, property.currency)}
            </p>

            {(property.bedrooms != null || property.bathrooms != null || property.size) && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {property.bedrooms != null && (
                  <div className="rounded-lg bg-background px-3 py-2.5">
                    <BedDouble className="h-4 w-4 text-qbay" />
                    <p className="mt-1 text-sm font-semibold tabular-nums">{property.bedrooms}</p>
                    <p className="text-[11px] text-muted-foreground">Bedrooms</p>
                  </div>
                )}
                {property.bathrooms != null && (
                  <div className="rounded-lg bg-background px-3 py-2.5">
                    <Bath className="h-4 w-4 text-qbay" />
                    <p className="mt-1 text-sm font-semibold tabular-nums">{property.bathrooms}</p>
                    <p className="text-[11px] text-muted-foreground">Bathrooms</p>
                  </div>
                )}
                {property.size ? (
                  <div className="rounded-lg bg-background px-3 py-2.5">
                    <Ruler className="h-4 w-4 text-qbay" />
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {property.size} <span className="text-[11px] font-normal">{property.size_unit ?? ""}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">Size</p>
                  </div>
                ) : null}
              </div>
            )}

            {assignedAgent && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                <StaffAvatar name={assignedAgent.full_name} url={assignedAgent.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">Assigned agent</p>
                  <p className="truncate text-sm font-medium">{assignedAgent.full_name}</p>
                </div>
                {assignedAgent.phone && (
                  <a
                    href={`tel:${assignedAgent.phone}`}
                    aria-label={`Call ${assignedAgent.full_name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {assignedAgent.email && (
                  <a
                    href={`mailto:${assignedAgent.email}`}
                    aria-label={`Email ${assignedAgent.full_name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}

            <PropertyWebsiteLinkButtons property={property} showHint className="mt-4" />

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              <Button
                variant="outline"
                size="sm"
                disabled={brochure.busyId !== null}
                onClick={() => brochure.download(property.id, advisor)}
              >
                <FileText className="h-3.5 w-3.5" /> {brochure.busyId === property.id ? "Building PDF..." : "PDF"}
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
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card>
            <h4 className="text-sm font-semibold">Specifications</h4>
            <dl className="mt-3 grid grid-cols-2 text-xs [&>dd]:border-b [&>dd]:border-border/70 [&>dd]:py-2 [&>dd]:font-medium [&>dt]:border-b [&>dt]:border-border/70 [&>dt]:py-2 [&>dt]:text-muted-foreground [&>:nth-last-child(-n+2)]:border-b-0">
              <dt className="text-muted-foreground">Bedrooms</dt>
              <dd>{property.bedrooms ?? "-"}</dd>
              <dt className="text-muted-foreground">Bathrooms</dt>
              <dd>{property.bathrooms ?? "-"}</dd>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{property.size ? `${property.size} ${property.size_unit ?? ""}` : "-"}</dd>
              <dt className="text-muted-foreground">Built-up area</dt>
              <dd>
                {property.built_up_area
                  ? `${property.built_up_area} ${property.built_up_area_unit ?? ""}`
                  : "-"}
              </dd>
              <dt className="text-muted-foreground">Developer</dt>
              <dd>{property.developer ?? "-"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{property.completion_status ?? "-"}</dd>
              <dt className="text-muted-foreground">Available from</dt>
              <dd>{property.available_from ? fmtDate(property.available_from) : "-"}</dd>
              <dt className="text-muted-foreground">Balcony</dt>
              <dd>{property.balcony == null ? "-" : property.balcony ? "Yes" : "No"}</dd>
              {property.property_type === "Apartment" && (
                <>
                  <dt className="text-muted-foreground">Maid's room</dt>
                  <dd>{property.maids_room == null ? "-" : property.maids_room ? "Yes" : "No"}</dd>
                </>
              )}
              {isVillaType(property.property_type) && (
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
          <DynamicFieldsView
            entityType="property"
            values={property.custom_fields as CustomFieldValues | null}
          />
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
          <PropertyMediaManager
            propertyId={propertyId}
            canUpload={canUpload}
            canEdit={canEdit || canUpload}
            canDelete={canDeleteUpload}
          />
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

        <div className="mt-3">
          <PropertySalesSection property={property} />
        </div>

        <PropertyViewingsSection propertyId={propertyId} />
        <PropertyTasksSection propertyId={propertyId} propertyTitle={property.title} />
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
