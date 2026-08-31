import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, MessageCircle, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button, Card } from "@/components/ui-primitives";
import { InteractionDrawer } from "@/components/interaction-drawer";
import { SelectField } from "@/components/select-field";
import { useInteractions, useDeleteInteraction } from "@/hooks/use-interactions";
import { fmtDateTime, INTERACTION_TYPES, type Interaction } from "@/lib/db";
import { AccessDenied } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";

export const Route = createFileRoute("/conversations")({
  head: () => ({ meta: [{ title: "Conversations" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Interaction | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: interactions = [] } = useInteractions({ search, type });
  const del = useDeleteInteraction();
  const selected = interactions.find((i) => i.id === selectedId) ?? interactions[0];
  const { can } = usePermissions();
  const canCreate = can("conversations", "create");
  const canEdit = can("conversations", "edit");
  const canDelete = can("conversations", "delete");

  if (!can("conversations", "view")) return <AppShell><AccessDenied /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Interactions"
        title="Conversations"
        description="Store and review every buyer interaction across all channels."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add interaction
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2">
        <input
          type="text"
          placeholder="Search interactions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 flex-1 min-w-[200px] rounded-lg bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <SelectField
          value={type}
          onChange={(v) => setType(v)}
          options={INTERACTION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
          emptyLabel="All types"
          className="w-44"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            All interactions ({interactions.length})
          </div>
          {interactions.length === 0 ? (
            <EmptyState compact className="border-0" icon={<MessageCircle className="h-4 w-4" />} title="No conversations" description="Logged interactions appear here." />
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {interactions.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setSelectedId(i.id)}
                  className={`block w-full border-b border-border px-4 py-3 text-left text-sm hover:bg-muted ${selected?.id === i.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{i.interaction_type.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDateTime(i.interaction_date)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{i.subject ?? "(no subject)"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {(i as unknown as { leads?: { full_name: string } }).leads?.full_name ?? "Unlinked"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex min-h-[420px] flex-col">
          {selected ? (
            <>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{selected.interaction_type.replace(/_/g, " ")} · {selected.direction}</span>
                  <h3 className="mt-1 text-base font-semibold">{selected.subject ?? "(no subject)"}</h3>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(selected.interaction_date)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(selected); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                  {canDelete && (
                    <button
                      className="rounded-md p-1.5 hover:bg-muted text-destructive"
                      onClick={async () => {
                        try { await del.mutateAsync(selected.id); toast.success("Deleted"); setSelectedId(null); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{selected.content ?? "(no content)"}</p>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <p className="text-sm font-semibold">Select a conversation</p>
                <p className="mt-1 text-xs text-muted-foreground">Supported types: {INTERACTION_TYPES.join(", ")}.</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <InteractionDrawer open={open} onOpenChange={setOpen} interaction={edit} />
    </AppShell>
  );
}
