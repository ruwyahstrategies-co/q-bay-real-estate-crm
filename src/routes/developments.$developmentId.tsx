import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Building, Inbox, Pencil, Globe, EyeOff, Video, Rotate3d } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button, Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { useDevelopment, useDevelopmentProperties, useUpdateDevelopment } from "@/hooks/use-developments";
import { useOwner } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { useCountries, useAreas, usePlaces } from "@/hooks/use-locations";
import { usePermissions } from "@/hooks/use-auth";
import { DevelopmentDrawer } from "@/components/development-drawer";
import { DevelopmentWebsiteLinkButtons } from "@/components/development-website-link";
import { BrochureExtractionCard } from "@/components/brochure-extraction-card";
import { MapboxPicker } from "@/components/mapbox-picker";
import { fmtMoney, fmtDate } from "@/lib/db";
import { sb } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developments/$developmentId")({
  head: () => ({ meta: [{ title: "Development" }] }),
  component: DevelopmentDetailPage,
});

function DevelopmentDetailPage() {
  const { developmentId } = Route.useParams();
  const { data: development } = useDevelopment(developmentId);
  const { data: properties = [] } = useDevelopmentProperties(developmentId);
  const { data: owner } = useOwner(development?.owner_id ?? undefined);
  const { data: team = [] } = useTeamMembers();
  const { data: countries = [] } = useCountries();
  const { data: areas = [] } = useAreas();
  const { data: places = [] } = usePlaces();
  const update = useUpdateDevelopment();
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const { data: enquiries = [] } = useQuery({
    queryKey: ["developments", "enquiries", developmentId],
    queryFn: async () => {
      const { data, error } = await sb.from("website_enquiries").select("*").eq("development_id", developmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!development) return null;

  const canEdit = can("developments", "edit");
  const canPublish = can("developments", "publish") || canEdit;

  const agent = team.find((t) => t.id === development.assigned_agent_id);
  const country = countries.find((c) => c.id === development.country_id);
  const area = areas.find((a) => a.id === development.area_id);
  const place = places.find((p) => p.id === development.place_id);
  const locationLabel = [place?.name, area?.name, country?.name].filter(Boolean).join(", ") || "-";

  return (
    <AppShell>
      <PermissionGate module="developments" action="view" page>
      <Link to="/developments" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="h-3 w-3" /> Back to Developments
      </Link>
      <PageHeader
        eyebrow="Development"
        title={development.name}
        description={development.developer ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canPublish && (
              <button
                onClick={() => update.mutate({ id: development.id, patch: { is_published: !development.is_published } })}
                className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]", development.is_published ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
              >
                {development.is_published ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {development.is_published ? "Published" : "Draft"}
              </button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Overview</h3>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{development.status?.replace(/_/g, " ") ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Developer</dt><dd>{development.developer ?? "-"}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{owner ? <Link to="/owners/$ownerId" params={{ ownerId: owner.id }} className="hover:underline">{owner.name}</Link> : "-"}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Assigned agent</dt><dd>{agent?.full_name ?? "Unassigned"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd className="text-right">{locationLabel}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Price range</dt><dd>{fmtMoney(development.price_from, development.currency)} - {fmtMoney(development.price_to, development.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{development.delivery_timeline ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd>{fmtDate(development.created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Last updated</dt><dd>{fmtDate(development.updated_at)}</dd></div>
          </dl>
          {development.description && <p className="mt-3 text-xs text-foreground/80">{development.description}</p>}
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Public listing</p>
            <DevelopmentWebsiteLinkButtons development={development} showHint />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold">Linked Properties ({properties.length})</h3>
          {properties.length === 0 ? (
            <EmptyState compact icon={<Building className="h-4 w-4" />} title="No properties linked yet" />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">{p.title}</Link>
                  <span className="text-muted-foreground">{fmtMoney(p.price, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h3 className="mb-2 text-sm font-semibold">Media</h3>
          {!development.hero_image_url && !development.hero_video_url && !development.tour_360_url ? (
            <p className="text-xs text-muted-foreground">No media added yet. Add a hero image, video or 360 tour from Edit.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {development.hero_image_url && (
                <div className="sm:col-span-1">
                  <img src={development.hero_image_url} alt={development.name} className="h-40 w-full rounded-lg object-cover" />
                </div>
              )}
              <div className="flex flex-col gap-2 sm:col-span-2">
                {development.hero_video_url && (
                  <a href={development.hero_video_url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <Video className="h-3.5 w-3.5" /> Watch hero video
                  </a>
                )}
                {development.tour_360_url && (
                  <a href={development.tour_360_url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <Rotate3d className="h-3.5 w-3.5" /> Open 360 tour
                  </a>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h3 className="mb-2 text-sm font-semibold">Location</h3>
          <MapboxPicker latitude={development.latitude} longitude={development.longitude} readOnly className="h-48" />
        </Card>

        <div className="lg:col-span-3">
          <BrochureExtractionCard development={development} />
        </div>

        <Card className="lg:col-span-3">
          <h3 className="mb-2 text-sm font-semibold">Connected Enquiries ({enquiries.length})</h3>
          {enquiries.length === 0 ? (
            <EmptyState compact icon={<Inbox className="h-4 w-4" />} title="No enquiries yet" description="Website enquiries for this development will appear here." />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {enquiries.map((e: any) => (
                <li key={e.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>
                  </div>
                  {e.message && <p className="mt-1 text-foreground/80">{e.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <DevelopmentDrawer open={editOpen} onOpenChange={setEditOpen} development={development} />
      </PermissionGate>
    </AppShell>
  );
}
