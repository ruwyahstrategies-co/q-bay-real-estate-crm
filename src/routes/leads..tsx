
function PropertyInterestsTab({ leadId }: { leadId: string }) {
  const { data, isLoading } = useLeadReferences(leadId);
  if (isLoading) return <EmptyState compact title="Loading…" />;
  const interests = (data?.interests ?? []) as any[];
  const mentioned = (data?.mentioned ?? []) as any[];
  const seen = new Set(interests.map((i) => i.property_id));
  const extras = mentioned.filter((m) => m.property_id && !seen.has(m.property_id));
  if (interests.length === 0 && extras.length === 0) {
    return <EmptyState compact title="No property interests yet" description="Properties this lead views, mentions or shortlists will appear here." />;
  }
  return (
    <div className="space-y-3">
      {interests.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold">Linked properties</h4>
          <ul className="mt-3 space-y-2">
            {interests.map((it) => {
              const p = it.properties;
              if (!p) return null;
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                    {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                  </Link>
                  <span className="text-muted-foreground capitalize">{it.interest_level ?? it.status ?? "interested"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {extras.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold">Mentioned in conversations</h4>
          <ul className="mt-3 space-y-2">
            {extras.slice(0, 20).map((e, i) => {
              const p = e.properties;
              if (!p) return null;
              return (
                <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs">
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="hover:underline">
                    {p.reference_code ? `${p.reference_code} · ` : ""}{p.title}
                  </Link>
                  <span className="text-muted-foreground">{fmtDate(e.occurred_at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
