import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Upload, type DevelopmentUpdate } from "@/lib/db";

export type BrochureExtraction = {
  description: string;
  highlights: string[];
  amenities: string[];
  property_types: string[];
  unit_mix: { type: string; beds: number | null; size_from_sqm: number | null; size_to_sqm: number | null; price_from: number | null; price_to: number | null }[];
  price_from: number | null;
  price_to: number | null;
  currency: string | null;
  completion_status: string | null;
  delivery_timeline: string | null;
};

export function useBrochureUpload(uploadId: string | null | undefined) {
  return useQuery({
    queryKey: ["uploads", "detail", uploadId ?? "none"],
    enabled: !!uploadId,
    queryFn: async (): Promise<Upload | null> => {
      const { data, error } = await sb.from("uploads").select("*").eq("id", uploadId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => (query.state.data?.processing_status === "processing" ? 3000 : false),
  });
}

export function useExtractBrochure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (developmentId: string) => {
      const { data, error } = await sb.functions.invoke("extract-brochure", { body: { development_id: developmentId } });
      if (error) {
        let msg = error.message;
        try {
          const ctx: any = (error as any).context;
          const txt = ctx && typeof ctx.text === "function" ? await ctx.text() : null;
          if (txt) { const p = JSON.parse(txt); if (p?.error) msg = p.error; }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return data as { ok?: boolean; upload_id?: string; extraction?: BrochureExtraction; error?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uploads"] }),
  });
}

/** Staff-reviewed approval — writes the (possibly edited) extraction into the development row. Never automatic. */
export function useApproveBrochureExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ developmentId, uploadId, fields }: { developmentId: string; uploadId: string; fields: Partial<BrochureExtraction> }) => {
      const patch: DevelopmentUpdate = {};
      if (fields.description !== undefined) patch.description = fields.highlights?.length
        ? `${fields.description}\n\nHighlights:\n${fields.highlights.map((h) => `- ${h}`).join("\n")}`
        : fields.description;
      if (fields.amenities !== undefined) patch.amenities = fields.amenities;
      if (fields.property_types !== undefined) patch.property_types = fields.property_types;
      if (fields.unit_mix !== undefined) patch.unit_mix = { units: fields.unit_mix };
      if (fields.price_from !== undefined) patch.price_from = fields.price_from;
      if (fields.price_to !== undefined) patch.price_to = fields.price_to;
      if (fields.currency !== undefined && fields.currency) patch.currency = fields.currency;
      if (fields.completion_status !== undefined) patch.completion_status = fields.completion_status;
      if (fields.delivery_timeline !== undefined) patch.delivery_timeline = fields.delivery_timeline;

      const { error: devErr } = await sb.from("developments").update(patch).eq("id", developmentId);
      if (devErr) throw devErr;
      const { error: upErr } = await sb.from("uploads").update({ processing_status: "completed" }).eq("id", uploadId);
      if (upErr) throw upErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["developments"] });
      qc.invalidateQueries({ queryKey: ["developments", "detail", vars.developmentId] });
      qc.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
}

export function useDiscardBrochureExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uploadId: string) => {
      const { error } = await sb.from("uploads").update({ processing_status: "uploaded", metadata: {} }).eq("id", uploadId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uploads"] }),
  });
}
