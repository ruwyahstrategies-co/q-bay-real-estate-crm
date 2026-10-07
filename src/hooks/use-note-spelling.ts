import { useMutation } from "@tanstack/react-query";
import { sb } from "@/lib/db";

/**
 * Asks the server to correct spelling, grammar and punctuation of one note.
 * Runs only when the user clicks "Correct spelling". Nothing is saved: the
 * corrected text goes back into the editor for the user to review and save.
 */
export function useCorrectNoteSpelling() {
  return useMutation({
    mutationFn: async (text: string): Promise<string> => {
      const { data, error } = await sb.functions.invoke("correct-note-spelling", {
        body: { text },
      });
      if (error) {
        const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
        let msg = error.message;
        try {
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) {
            const p = JSON.parse(txt);
            if (p?.error) msg = p.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const corrected = (data as { corrected?: string } | null)?.corrected;
      if (typeof corrected !== "string" || !corrected.trim()) {
        throw new Error("Spelling correction returned nothing");
      }
      return corrected;
    },
  });
}
