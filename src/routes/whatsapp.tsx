import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Info, MessageCircle, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AccessDenied } from "@/components/permission-gate";
import { WhatsappThreadPanel } from "@/components/whatsapp-thread-panel";
import { usePermissions } from "@/hooks/use-auth";
import {
  useWhatsappConversations,
  useWhatsappStatus,
  useWhatsappTemplates,
  type WhatsappConversation,
} from "@/hooks/use-whatsapp";
import { filterConversations } from "@/lib/whatsapp-inbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp inbox" }] }),
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
  component: WhatsappInboxPage,
});

const MODE_LABEL = {
  shared: "One shared company number",
  individual: "Each agent's own number",
  undecided: "Number model not chosen yet",
} as const;

function listName(c: WhatsappConversation) {
  return c.leads?.full_name ?? c.contact_name ?? `+${c.wa_id}`;
}

function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Qatar" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Qatar" });
}

function WhatsappInboxPage() {
  const { can } = usePermissions();
  const { lead } = Route.useSearch();
  const allowed = can("conversations", "view");
  const { data: status } = useWhatsappStatus();
  const { data: conversations = [], isLoading } = useWhatsappConversations(allowed);
  const { data: templates = [] } = useWhatsappTemplates(allowed && can("conversations", "create"));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () => filterConversations(conversations, { unreadOnly, search }, (c) => c.leads?.full_name ?? null),
    [conversations, unreadOnly, search],
  );
  const totalUnread = conversations.reduce((n, c) => n + c.unread_count, 0);

  // Arriving from a lead opens that lead's most recent conversation.
  useEffect(() => {
    if (!lead || selectedId) return;
    const match = conversations.find((c) => c.lead_id === lead);
    if (match) setSelectedId(match.id);
  }, [lead, conversations, selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  if (!allowed) {
    return (
      <AppShell>
        <AccessDenied />
      </AppShell>
    );
  }

  const live = status?.live_enabled ?? false;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Messaging"
        title="WhatsApp inbox"
        description="Every WhatsApp conversation with your leads, with delivery and read status."
      />

      {status && !live ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-muted px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <div>
            <p className="font-medium">WhatsApp is prepared but not switched on.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing is sent or received until the Meta setup is finished and an administrator switches it on.
              {" "}
              Number model: {MODE_LABEL[status.mode]}.{" "}
              <Link to="/settings" className="underline-offset-2 hover:underline">
                Open settings
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-canvas shadow-card lg:grid-cols-[340px_1fr]">
        <div className={cn("flex min-h-0 flex-col border-border lg:border-r", selected ? "hidden lg:flex" : "flex")}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <input
                className="h-9 w-full rounded-lg border border-border bg-canvas pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="Search name, number or message"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search conversations"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only{totalUnread > 0 ? ` (${totalUnread})` : ""}
            </label>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? <li className="p-4 text-xs text-muted-foreground">Loading...</li> : null}
            {!isLoading && visible.length === 0 ? (
              <li className="p-4">
                <EmptyState
                  compact
                  icon={<MessageCircle className="h-4 w-4" />}
                  title={conversations.length ? "No conversations match" : "No conversations yet"}
                  description={conversations.length ? "Try clearing the search." : "Conversations appear here once WhatsApp is switched on."}
                />
              </li>
            ) : null}
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left hover:bg-muted/60",
                    c.id === selectedId && "bg-muted",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-sm", c.unread_count > 0 ? "font-semibold" : "font-medium")}>{listName(c)}</p>
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground">{shortTime(c.last_message_at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.last_message_preview ?? "No messages yet"}</p>
                  </div>
                  {c.unread_count > 0 ? (
                    <span className="mt-0.5 flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-qbay px-1.5 text-[10px] font-semibold text-white">
                      {c.unread_count}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("min-h-0", selected ? "block" : "hidden lg:block")}>
          {selected ? (
            <WhatsappThreadPanel
              key={selected.id}
              conversation={selected}
              templates={templates}
              canSend={can("conversations", "create")}
              liveEnabled={live}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                compact
                icon={<MessageCircle className="h-4 w-4" />}
                title="Choose a conversation"
                description="Pick someone from the list to read the thread and reply."
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
