import { useEffect, useRef, useState } from "react";
import { Send, Loader2, ExternalLink, Sparkles, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "./ui-primitives";
import { useMarketResearchMessages, useSendMarketResearchMessage } from "@/hooks/use-market-research-chat";
import { fmtDateTime } from "@/lib/db";
import { cn } from "@/lib/utils";

const SUGGESTED_QUESTIONS = [
  "What is happening in Lusail apartment pricing?",
  "Compare rents in The Pearl and West Bay.",
  "What developments are gaining attention right now?",
  "What is demand like for 2-bedroom units in Doha?",
];

export function MarketResearchChat() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const { data: messages = [] } = useMarketResearchMessages(conversationId);
  const send = useSendMarketResearchMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, send.isPending]);

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setDraft("");
    try {
      const res = await send.mutateAsync({ conversationId, message: trimmed });
      setConversationId(res.conversation_id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="flex h-[560px] flex-col p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h4 className="text-sm font-semibold">Property Market Research</h4>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => { setConversationId(undefined); setDraft(""); }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> New conversation
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Ask about pricing, demand or developments across Qatar's market. Try:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() => handleSend(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-foreground text-background" : "bg-muted")}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.sources?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
                  {m.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px] hover:underline"
                    >
                      {s.publisher ?? s.title} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] opacity-60">{fmtDateTime(m.created_at)}</p>
            </div>
          </div>
        ))}
        {send.isPending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Researching...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => { e.preventDefault(); handleSend(draft); }}
      >
        <input
          className="h-10 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Ask about pricing, demand, or a comparison..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={send.isPending}
        />
        <Button type="submit" size="sm" disabled={send.isPending || !draft.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </Card>
  );
}
