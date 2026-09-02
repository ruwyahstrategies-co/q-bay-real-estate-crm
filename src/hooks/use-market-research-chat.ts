import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";

export type MarketResearchSource = { title: string; url: string; publisher?: string };
export type MarketResearchMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: MarketResearchSource[];
  created_at: string;
};

const keys = {
  conversations: ["market_research_conversations"] as const,
  messages: (id: string) => ["market_research_messages", id] as const,
};

export function useMarketResearchConversations() {
  return useQuery({
    queryKey: keys.conversations,
    queryFn: async () => {
      const { data, error } = await sb.from("market_research_conversations").select("*").order("updated_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarketResearchMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: conversationId ? keys.messages(conversationId) : ["market_research_messages", "none"],
    enabled: !!conversationId,
    queryFn: async (): Promise<MarketResearchMessage[]> => {
      const { data, error } = await sb
        .from("market_research_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MarketResearchMessage[];
    },
  });
}

export function useSendMarketResearchMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId?: string; message: string }) => {
      const { data, error } = await sb.functions.invoke("market-research-chat", {
        body: { conversation_id: conversationId, message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok: true; conversation_id: string; content: string; sources: MarketResearchSource[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.messages(data.conversation_id) });
      qc.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}
