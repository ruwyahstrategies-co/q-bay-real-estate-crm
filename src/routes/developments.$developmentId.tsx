import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building, Inbox } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { useDevelopment, useDevelopmentProperties } from "@/hooks/use-developments";
import { BrochureExtractionCard } from "@/components/brochure-extraction-card";
import { fmtMoney, fmtDate } from "@/lib/db";
import { sb } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/developments/$developmentId")({
  head: () => ({ meta: [{ title: "Development" }] }),
  component: DevelopmentDetailPage,
});

function DevelopmentDetailPage() {
  const { developmentId } = Route.useParams();
  const { data: development } = useDevelopment(developmentId);
  const { data: properties = [] } = useDevelopmentProperties(developmentId);
  const { data: enquiries = [] } = useQuery({
    queryKey: ["developments", "enquiries", developmentId],
    queryFn: async () => {
      const { data, error } = await sb.from("website_enquiries").select("*").eq("development_id", developmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!development) return null;

  return (
    <AppShell>
      <PermissionGate module="developments" action="view" page>
      <Link to="/developments" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="h-3 w-3" /> Back to Developments
      </Link>
      <PageHeader eyebrow="Development" title={development.name} description={development.developer ?? undefined} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Overview</h3>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{development.status ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Price range</dt><dd>{fmtMoney(development.price_from, development.currency)} - {fmtMoney(development.price_to, development.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Published</dt><dd>{development.is_published ? "Yes" : "No"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{development.delivery_timeline ?? "-"}</dd></div>
          </dl>
          {development.description && <p className="mt-3 text-xs text-foreground/80">{development.description}</p>}
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
      </PermissionGate>
    </AppShell>
  );
}
