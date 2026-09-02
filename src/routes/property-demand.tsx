import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, Globe, TrendingUp, AlertCircle, ChevronDown, ChevronUp, Users, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/select-field";
import { MarketResearchChat } from "@/components/market-research-chat";
import { useProperties } from "@/hooks/use-properties";
import {
  usePropertyEvents,
  useScanMentions,
  EVENT_LABELS,
  type PropertyEvent,
} from "@/hooks/use-property-events";
import { usePropertyDemandScores, usePropertySupport, type DemandRow } from "@/hooks/use-property-demand";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/property-demand")({
  head: () => ({
    meta: [
      { title: "Property Demand" },
      { name: "description", content: "Real-time view of buyer attention across properties, areas and types." },
    ],
  }),
  component: PropertyDemandPage,
});

const RANGE_OPTIONS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

function PropertyDemandPage() {
  const [rangeDays, setRangeDays] = useState<RangeKey>("30");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterAvailability, setFilterAvailability] = useState<string>("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const sinceISO = useMemo(
    () => new Date(Date.now() - Number(rangeDays) * 24 * 3600 * 1000).toISOString(),
    [rangeDays],
  );

  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: events = [], isLoading: eventsLoading } = usePropertyEvents(sinceISO);
  const scanMentions = useScanMentions();

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!e.property_id) return false;
      const p = propertyById.get(e.property_id);
      if (!p) return false;
      if (filterLocation && (p.location ?? "").toLowerCase() !== filterLocation.toLowerCase()) return false;
      if (filterType && (p.property_type ?? "") !== filterType) return false;
      if (filterAvailability && (p.availability ?? "") !== filterAvailability) return false;
      const price = Number(p.price ?? 0);
      if (minPrice && price < Number(minPrice)) return false;
      if (maxPrice && price > Number(maxPrice)) return false;
      return true;
    });
  }, [events, propertyById, filterLocation, filterType, filterAvailability, minPrice, maxPrice]);

  // Aggregations
  const perProperty = useMemo(() => {
    const map = new Map<string, { score: number; counts: Record<string, number>; lastAt: string }>();
    for (const e of filteredEvents) {
      if (!e.property_id) continue;
      const cur = map.get(e.property_id) ?? { score: 0, counts: {}, lastAt: e.occurred_at };
      cur.score += Number(e.weight ?? 1);
      cur.counts[e.event_type] = (cur.counts[e.event_type] ?? 0) + 1;
      if (e.occurred_at > cur.lastAt) cur.lastAt = e.occurred_at;
      map.set(e.property_id, cur);
    }
    return Array.from(map.entries())
      .map(([pid, v]) => ({
        property: propertyById.get(pid)!,
        ...v,
      }))
      .filter((r) => r.property);
  }, [filteredEvents, propertyById]);

  const topViewed = [...perProperty].sort((a, b) => (b.counts.view ?? 0) - (a.counts.view ?? 0)).slice(0, 8);
  const topMentioned = [...perProperty].sort((a, b) => (b.counts.mention ?? 0) - (a.counts.mention ?? 0)).slice(0, 8);
  const topEnquired = [...perProperty].sort((a, b) => (b.counts.enquiry ?? 0) - (a.counts.enquiry ?? 0)).slice(0, 8);
  const topViewings = [...perProperty].sort((a, b) => (b.counts.viewing_request ?? 0) - (a.counts.viewing_request ?? 0)).slice(0, 8);

  const locationCounts = aggCountKey(filteredEvents, propertyById, (p) => p.location);
  const typeCounts = aggCountKey(filteredEvents, propertyById, (p) => p.property_type);
  const priceBuckets = aggPriceBuckets(filteredEvents, propertyById);

  const highDemandLimited = perProperty
    .filter((r) => r.property.availability !== "available" && r.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const viewsNoEnquiries = perProperty.filter((r) => (r.counts.view ?? 0) >= 3 && (r.counts.enquiry ?? 0) === 0).slice(0, 6);
  const enquiriesNoOffers = perProperty.filter((r) => (r.counts.enquiry ?? 0) >= 2 && (r.counts.offer ?? 0) === 0).slice(0, 6);

  // Pricing opportunities - evidence-based, never auto-changes price.
  const pricingOpps = perProperty
    .map((r) => {
      const e = r.counts;
      const strongSignals = (e.enquiry ?? 0) * 2 + (e.viewing_request ?? 0) * 3 + (e.offer ?? 0) * 4 + (e.shortlist ?? 0);
      const supply = r.property.availability === "available" ? 1 : 0.5;
      const conf = strongSignals >= 18 ? "high" : strongSignals >= 10 ? "medium" : strongSignals >= 5 ? "low" : null;
      return conf ? { row: r, strongSignals, supply, conf } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b!.strongSignals) - (a!.strongSignals))
    .slice(0, 6) as { row: typeof perProperty[number]; strongSignals: number; supply: number; conf: "low" | "medium" | "high" }[];

  // Unique location/type for filters
  const allLocations = Array.from(new Set(properties.map((p) => p.location).filter(Boolean))) as string[];
  const allTypes = Array.from(new Set(properties.map((p) => p.property_type).filter(Boolean))) as string[];

  return (
    <AppShell>
      <PermissionGate module="property_demand" action="view" page>
      <PageHeader
        eyebrow="Demand"
        title="Property Demand Analytics"
        description="Real buyer activity across views, mentions, enquiries, viewings and offers."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const r = await scanMentions.mutateAsync();
                toast.success(`Mentions scan complete - ${r.inserted} new`);
              } catch (e) { toast.error((e as Error).message); }
            }}
            disabled={scanMentions.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", scanMentions.isPending && "animate-spin")} />
            Rescan mentions
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeDays(r.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium",
                  rangeDays === r.key ? "bg-foreground text-primary-foreground" : "bg-muted text-foreground/70 hover:bg-muted/70",
                )}
              >{r.label}</button>
            ))}
          </div>
          <Select label="Location" value={filterLocation} onChange={setFilterLocation} options={["", ...allLocations]} />
          <Select label="Type" value={filterType} onChange={setFilterType} options={["", ...allTypes]} />
          <Select label="Availability" value={filterAvailability} onChange={setFilterAvailability} options={["", "available", "reserved", "sold", "off_market"]} />
          <NumInput label="Min price" value={minPrice} onChange={setMinPrice} />
          <NumInput label="Max price" value={maxPrice} onChange={setMaxPrice} />
        </div>
      </Card>

      {eventsLoading ? (
        <EmptyState title="Loading demand..." />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-4 w-4" />}
          title="No property activity in this window"
          description="Open property pages, run a mention rescan, or record enquiries to start tracking demand."
        />
      ) : (
        <>
          <DemandRankingSection propertyById={propertyById} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PropertyListCard title="Most viewed" rows={topViewed} eventKey="view" />
            <PropertyListCard title="Most mentioned" rows={topMentioned} eventKey="mention" />
            <PropertyListCard title="Most enquired" rows={topEnquired} eventKey="enquiry" />
            <PropertyListCard title="Most viewing requests" rows={topViewings} eventKey="viewing_request" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <CountList title="Most requested locations" entries={locationCounts} />
            <CountList title="Most requested types" entries={typeCounts} />
            <CountList title="Price-range demand" entries={priceBuckets} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <GapCard
              title="High demand, limited availability"
              empty="None detected"
              rows={highDemandLimited}
              renderRight={(r) => (
                <span className="text-[10px] text-muted-foreground capitalize">{r.property.availability}</span>
              )}
            />
            <GapCard
              title="Views but no enquiries"
              empty="None detected"
              rows={viewsNoEnquiries}
              renderRight={(r) => <span className="text-[10px] text-muted-foreground">{r.counts.view ?? 0} views</span>}
            />
            <GapCard
              title="Enquiries but no offers"
              empty="None detected"
              rows={enquiriesNoOffers}
              renderRight={(r) => <span className="text-[10px] text-muted-foreground">{r.counts.enquiry ?? 0} enquiries</span>}
            />
          </div>

          {/* Pricing opportunities */}
          <div className="mt-5">
            <h3 className="mb-3 text-[16px] font-semibold">Evidence-based pricing opportunities</h3>
            {pricingOpps.length === 0 ? (
              <EmptyState compact title="No pricing opportunities yet" description="Stronger signals (enquiries, viewings, offers) build these over time." />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {pricingOpps.map(({ row, conf }) => (
                  <PricingOpportunityCard key={row.property.id} row={row} confidence={conf} rangeDays={Number(rangeDays)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4" />
          <h3 className="text-[16px] font-semibold">Property Market Research</h3>
        </div>
        <MarketResearchChat />
      </div>
      </PermissionGate>
    </AppShell>
  );
}

/* - subcomponents - */

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <SelectField
        value={value || null}
        onChange={(v) => onChange(v ?? "")}
        options={options.filter((o) => o).map((o) => ({ value: o, label: o }))}
        emptyLabel="All"
        className="h-8 w-40 text-xs"
      />
    </label>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-28 rounded-md border border-border bg-canvas px-2 text-xs" />
    </label>
  );
}

function aggCountKey(
  events: PropertyEvent[],
  byId: Map<string, any>,
  fn: (p: any) => string | null | undefined,
): [string, number][] {
  const m = new Map<string, number>();
  for (const e of events) {
    if (!e.property_id) continue;
    const p = byId.get(e.property_id);
    if (!p) continue;
    const k = fn(p);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + Number(e.weight ?? 1));
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function aggPriceBuckets(events: PropertyEvent[], byId: Map<string, any>): [string, number][] {
  const buckets = [
    { label: "< 1M", max: 1_000_000 },
    { label: "1M - 3M", max: 3_000_000 },
    { label: "3M - 6M", max: 6_000_000 },
    { label: "6M - 10M", max: 10_000_000 },
    { label: "10M +", max: Infinity },
  ];
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.property_id) continue;
    const p = byId.get(e.property_id);
    if (!p?.price) continue;
    const bucket = buckets.find((b) => p.price < b.max)?.label;
    if (!bucket) continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + Number(e.weight ?? 1));
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function PropertyListCard({
  title,
  rows,
  eventKey,
}: {
  title: string;
  rows: { property: any; counts: Record<string, number>; score: number }[];
  eventKey: PropertyEvent["event_type"];
}) {
  return (
    <Card>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {rows.filter((r) => (r.counts[eventKey] ?? 0) > 0).length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.filter((r) => (r.counts[eventKey] ?? 0) > 0).map((r) => (
            <li key={r.property.id} className="flex items-center justify-between gap-2">
              <Link to="/properties/$propertyId" params={{ propertyId: r.property.id }} className="truncate hover:underline">
                {r.property.title}
              </Link>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{r.counts[eventKey] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CountList({ title, entries }: { title: string; entries: [string, number][] }) {
  return (
    <Card>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between">
              <span className="truncate">{k}</span>
              <span className="text-muted-foreground">{v.toFixed(0)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GapCard({
  title,
  rows,
  empty,
  renderRight,
}: {
  title: string;
  rows: { property: any; counts: Record<string, number>; score: number }[];
  empty: string;
  renderRight: (r: any) => React.ReactNode;
}) {
  return (
    <Card>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.map((r) => (
            <li key={r.property.id} className="flex items-center justify-between gap-2">
              <Link to="/properties/$propertyId" params={{ propertyId: r.property.id }} className="truncate hover:underline">
                {r.property.title}
              </Link>
              {renderRight(r)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PricingOpportunityCard({
  row,
  confidence,
  rangeDays,
}: {
  row: { property: any; counts: Record<string, number>; score: number };
  confidence: "low" | "medium" | "high";
  rangeDays: number;
}) {
  const p = row.property;
  const c = row.counts;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{p.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.reference_code ? `${p.reference_code} · ` : ""}{p.property_type ?? ""} · {p.location ?? "-"}
          </p>
          <p className="mt-2 text-base font-semibold">{fmtMoney(p.price, p.currency)}</p>
        </div>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium",
          confidence === "high" ? "bg-pastel-green text-foreground" :
          confidence === "medium" ? "bg-pastel-cream text-foreground" : "bg-muted text-foreground/70",
        )}>{confidence} confidence</span>
      </div>
      <p className="mt-3 text-xs text-foreground/80">
        Over the last {rangeDays} days this property received
        {" "}<strong>{c.enquiry ?? 0}</strong> enquiries,
        {" "}<strong>{c.viewing_request ?? 0}</strong> viewing requests,
        {" "}<strong>{c.offer ?? 0}</strong> offer signals,
        {" "}<strong>{c.shortlist ?? 0}</strong> shortlist actions and
        {" "}<strong>{c.view ?? 0}</strong> views. Consider reviewing the asking price or
        reducing incentives.
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        This is a recommendation only - no price change is applied automatically.
      </p>
      <div className="mt-3 flex gap-2">
        <Link to="/properties/$propertyId" params={{ propertyId: p.id }}>
          <Button size="sm" variant="outline">Review Price</Button>
        </Link>
      </div>
    </Card>
  );
}

/* - Demand ranking: server-side weighted score (internal behaviour prioritised) - */

function DemandRankingSection({ propertyById }: { propertyById: Map<string, any> }) {
  const { data: rows = [], isLoading } = usePropertyDemandScores();
  const [internalOnly, setInternalOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const ranked = useMemo(() => {
    const scored = rows.map((r) => {
      const internal = r.interested_leads * 4
        + r.shortlists * 3
        + r.viewing_requests * 5
        + r.enquiries * 3
        + r.offers * 8
        + r.brochure_downloads * 2
        + r.views * 1
        - r.rejections * 2;
      const score = internalOnly ? internal : internal + r.mentions * 1;
      return { row: r, internal, score };
    }).filter((x) => x.score > 0 && propertyById.get(x.row.property_id));
    return scored.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [rows, internalOnly, propertyById]);

  if (isLoading) return null;
  if (ranked.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[16px] font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Demand ranking
        </h3>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={internalOnly}
            onChange={(e) => setInternalOnly(e.target.checked)}
            className="h-3 w-3"
          />
          Internal buyer signals only (ignore online mentions)
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Transparent weighted score: interested leads ×4, shortlists ×3, enquiries ×3, viewing requests ×5,
        offers ×8, brochures ×2, views ×1, rejections -2{internalOnly ? "" : ", online mentions ×1"}.
      </p>
      <ul className="mt-3 space-y-1.5">
        {ranked.map(({ row, score, internal }) => {
          const p = propertyById.get(row.property_id);
          const open = expanded === row.property_id;
          return (
            <li key={row.property_id} className="rounded-md border border-border p-2 text-xs">
              <button
                onClick={() => setExpanded(open ? null : row.property_id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <Link to="/properties/$propertyId" params={{ propertyId: row.property_id }} className="hover:underline">
                      {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {p.location ?? "-"} · {fmtMoney(p.price, p.currency)} · {p.availability ?? "-"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <Chip label="leads" v={row.interested_leads} />
                    <Chip label="enquiries" v={row.enquiries} />
                    <Chip label="shortlists" v={row.shortlists} />
                    <Chip label="viewings" v={row.viewing_requests} />
                    <Chip label="offers" v={row.offers} />
                    <Chip label="views" v={row.views} />
                    <Chip label="brochures" v={row.brochure_downloads} />
                    <Chip label="mentions" v={row.mentions} />
                    <Chip label="rejections" v={row.rejections} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold">{score}</p>
                  <p className="text-[10px] text-muted-foreground">internal {internal}</p>
                  {open ? <ChevronUp className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
                </div>
              </button>
              {open && <SupportingDetails propertyId={row.property_id} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Chip({ label, v }: { label: string; v: number }) {
  if (!v) return null;
  return <span className="rounded-md bg-muted px-1.5 py-0.5">{label} {v}</span>;
}

function SupportingDetails({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = usePropertySupport(propertyId);
  if (isLoading || !data) return <p className="mt-2 text-[11px] text-muted-foreground">Loading...</p>;
  const { interests, events, interactions } = data;
  const leadsMap = new Map<string, { id: string; full_name: string; stage?: string }>();
  for (const i of interests) {
    if (i.leads) leadsMap.set(i.leads.id, { id: i.leads.id, full_name: i.leads.full_name, stage: i.leads.pipeline_stage });
  }
  for (const e of events) {
    if (e.leads) leadsMap.set(e.leads.id, { id: e.leads.id, full_name: e.leads.full_name });
  }
  const leadsArr = Array.from(leadsMap.values());

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-2">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Users className="h-3 w-3" /> Supporting leads ({leadsArr.length})
        </p>
        {leadsArr.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">No linked leads.</p> : (
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {leadsArr.slice(0, 8).map((l) => (
              <li key={l.id}>
                <Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline">
                  {l.full_name}{l.stage ? <span className="text-muted-foreground"> · {l.stage}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <MessageCircle className="h-3 w-3" /> Supporting conversations ({interactions.length})
        </p>
        {interactions.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">No conversations linked.</p> : (
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {interactions.slice(0, 8).map((i) => (
              <li key={i.id} className="truncate">
                {i.lead_id ? (
                  <Link to="/leads/$leadId" params={{ leadId: i.lead_id }} className="hover:underline">
                    {i.leads?.full_name ?? "Lead"}
                  </Link>
                ) : <span>Interaction</span>}
                <span className="text-muted-foreground"> · {titleCase(i.interaction_type)} · {fmtDateTime(i.interaction_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

