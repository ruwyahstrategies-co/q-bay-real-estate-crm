import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Property, type PropertyInsert, type PropertyUpdate } from "@/lib/db";
import { getR2SignedReadUrl } from "@/lib/r2";

export const propertyKeys = {
  all: ["properties"] as const,
  list: (filters?: Record<string, unknown>) => ["properties", "list", filters ?? {}] as const,
  detail: (id: string) => ["properties", "detail", id] as const,
  media: (id: string) => ["properties", "media", id] as const,
};

export function useProperties(opts?: {
  search?: string;
  type?: string | null;
  status?: "active" | "archived" | "all";
  /** Availability filter: a stored availability value, or "needs_confirmation" for overdue check-ins. */
  availability?: string | null;
}) {
  const { search = "", type = null, status = "active", availability = null } = opts ?? {};
  return useQuery({
    queryKey: propertyKeys.list({ search, type, status, availability }),
    queryFn: async (): Promise<Property[]> => {
      let q = sb.from("properties").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (type) q = q.eq("property_type", type);
      if (availability === "needs_confirmation") {
        q = q.lt("availability_next_due_at", new Date().toISOString());
      } else if (availability) {
        q = q.eq("availability", availability);
      }
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},reference_code.ilike.${term},location.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: id ? propertyKeys.detail(id) : ["properties", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("properties").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** First (display_order 0) media image per property, as signed preview URLs, for list/grid thumbnails. */
export function usePropertyThumbnails(propertyIds: string[]) {
  const ids = [...propertyIds].sort();
  return useQuery({
    queryKey: [...propertyKeys.all, "thumbnails", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await sb
        .from("property_media")
        .select("property_id, display_order, uploads(id, storage_provider, storage_bucket, storage_path, public_url)")
        .in("property_id", ids)
        .eq("media_type", "image")
        .order("display_order", { ascending: true });
      if (error) throw error;

      type ThumbnailUpload = {
        id: string;
        storage_provider: string;
        storage_bucket: string;
        storage_path: string;
        public_url: string | null;
      };
      type ThumbnailRow = { property_id: string; uploads: ThumbnailUpload | null };
      const firstByProperty = new Map<string, ThumbnailUpload>();
      for (const row of (data ?? []) as unknown as ThumbnailRow[]) {
        if (!row.uploads || firstByProperty.has(row.property_id)) continue;
        firstByProperty.set(row.property_id, row.uploads);
      }

      // Prefer the already-known public_url (fast, no signing round-trip);
      // fall back to a signed URL only for private/legacy rows without one.
      const entries = await Promise.all(
        Array.from(firstByProperty.entries()).map(async ([propertyId, upload]) => {
          if (upload.public_url) return [propertyId, upload.public_url] as const;
          if (upload.storage_provider === "r2") {
            try {
              const signedUrl = await getR2SignedReadUrl(upload.id);
              return [propertyId, signedUrl] as const;
            } catch {
              return [propertyId, undefined] as const;
            }
          }
          const { data: signed } = await sb.storage
            .from(upload.storage_bucket)
            .createSignedUrl(upload.storage_path, 3600);
          return [propertyId, signed?.signedUrl] as const;
        }),
      );
      return Object.fromEntries(entries.filter(([, url]) => !!url)) as Record<string, string>;
    },
  });
}

export function usePropertyMedia(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? propertyKeys.media(propertyId) : ["properties", "media", "none"],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_media")
        .select("*, uploads(*)")
        .eq("property_id", propertyId!)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Marks one gallery image as the hero and syncs properties.hero_image_url for backward compatibility with existing hero rendering. */
export function useSetHeroMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      mediaId,
      imageUrl,
    }: {
      propertyId: string;
      mediaId: string;
      imageUrl: string | null;
    }) => {
      await sb.from("property_media").update({ is_hero: false }).eq("property_id", propertyId).eq("is_hero", true);
      const { error: heroErr } = await sb.from("property_media").update({ is_hero: true }).eq("id", mediaId);
      if (heroErr) throw heroErr;
      if (imageUrl) {
        const { error: propErr } = await sb.from("properties").update({ hero_image_url: imageUrl }).eq("id", propertyId);
        if (propErr) throw propErr;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: propertyKeys.media(vars.propertyId) });
      qc.invalidateQueries({ queryKey: propertyKeys.detail(vars.propertyId) });
      qc.invalidateQueries({ queryKey: propertyKeys.all });
    },
  });
}

/** Reorders gallery images by writing new display_order values. */
export function useReorderPropertyMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      items,
    }: {
      propertyId: string;
      items: { id: string; display_order: number }[];
    }) => {
      const results = await Promise.all(
        items.map((it) => sb.from("property_media").update({ display_order: it.display_order }).eq("id", it.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: propertyKeys.media(vars.propertyId) }),
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PropertyInsert) => {
      const { data, error } = await sb.from("properties").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PropertyUpdate }) => {
      const { data, error } = await sb
        .from("properties")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: propertyKeys.all });
      qc.invalidateQueries({ queryKey: propertyKeys.detail(vars.id) });
    },
  });
}

export function useArchiveProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("properties")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useRestoreProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("properties")
        .update({ status: "active", archived_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

/** Live preview of the reference code a new/edited property will get once saved (owner+agent both selected). Purely informational - the real value is reserved server-side on insert/update. */
export function usePropertyReferencePreview(
  ownerId: string | null | undefined,
  agentId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["properties", "reference-preview", ownerId ?? "none", agentId ?? "none"],
    enabled: !!ownerId && !!agentId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.rpc("preview_property_reference", {
        _owner_id: ownerId!,
        _agent_id: agentId!,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}
