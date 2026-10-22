import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  sb,
  PROPERTY_PURPOSES,
  type Property,
  type PropertyInsert,
  type PropertyUpdate,
} from "@/lib/db";
import { getR2SignedReadUrl } from "@/lib/r2";
import { typesForFilter } from "@/lib/property-types";
import { PROPERTY_STATUS_TABS, withStatusTab, type PropertyStatusTab } from "@/lib/property-status-tabs";

export const propertyKeys = {
  all: ["properties"] as const,
  list: (filters?: Record<string, unknown>) => ["properties", "list", filters ?? {}] as const,
  detail: (id: string) => ["properties", "detail", id] as const,
  media: (id: string) => ["properties", "media", id] as const,
};

/** The two inventory sides. Sale also covers off-plan, off-plan resale and commercial purposes. */
export type PropertyPurposeTab = "sale" | "rent";

/** Every stored purpose that belongs on the Sale side: all of them except "rent". */
export const SALE_PURPOSES: string[] = PROPERTY_PURPOSES.filter((p) => p !== "rent");

/** Which side of the inventory a stored purpose value belongs to. */
export function purposeTabOf(purpose: string | null | undefined): PropertyPurposeTab {
  return purpose === "rent" ? "rent" : "sale";
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
};

export type PropertyFilters = {
  search?: string;
  type?: string | null;
  /** Archive state, independent of the Sale/Rent side and of availability. */
  status?: "active" | "archived" | "all";
  /** Availability filter: a stored availability value, or "needs_confirmation" for overdue check-ins. */
  availability?: string | null;
  /** Sale or Rent, applied in the database on properties.purpose. null = both sides. */
  purpose?: PropertyPurposeTab | null;
  /** Price range, inclusive, in the property's own currency. */
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Any of these assigned agents. */
  agentIds?: string[];
  /** Country, then any of these areas, then one place. Each narrows the one before it. */
  countryId?: string | null;
  areaIds?: string[];
  placeId?: string | null;
  /** Approval state. null = every state. */
  approval?: ApprovalStatus | null;
  developmentId?: string | null;
  /** Any of these (empty = no filter). The singular options stay for pages that filter on one value. */
  types?: string[];
  availabilities?: string[];
  developmentIds?: string[];
  approvals?: ApprovalStatus[];
  /** At least this many bedrooms. */
  minBedrooms?: number | null;
  furnishing?: string | null;
  /** On the public website (true), not on it (false), or either (null). */
  published?: boolean | null;
};

/** A property as the inventory list shows it: the row plus the name of the development it belongs to. */
export type PropertyListRow = Property & { developments: { name: string } | null };

type FilterChain<T> = {
  eq(column: string, value: unknown): T;
  in(column: string, values: unknown[]): T;
  lt(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
};

/** The one place inventory filters are translated to database conditions (list, pages and counts share it). */
function applyPropertyFilters<T extends FilterChain<T>>(q: T, f: PropertyFilters, includePurpose = true): T {
  const {
    search = "",
    type = null,
    status = "active",
    availability = null,
    purpose = null,
    minPrice = null,
    maxPrice = null,
    agentIds = [],
    countryId = null,
    areaIds = [],
    placeId = null,
    approval = null,
    developmentId = null,
    minBedrooms = null,
    furnishing = null,
    published = null,
    types = [],
    availabilities = [],
    developmentIds = [],
    approvals = [],
  } = f;
  if (status !== "all") q = q.eq("status", status);
  if (includePurpose && purpose === "rent") q = q.eq("purpose", "rent");
  if (includePurpose && purpose === "sale") q = q.in("purpose", SALE_PURPOSES);
  if (type) q = q.in("property_type", typesForFilter(type));
  if (availability === "needs_confirmation") {
    q = q.lt("availability_next_due_at", new Date().toISOString());
  } else if (availability) {
    q = q.eq("availability", availability);
  }
  if (minPrice != null) q = q.gte("price", minPrice);
  if (maxPrice != null) q = q.lte("price", maxPrice);
  if (agentIds.length > 0) q = q.in("assigned_agent_id", agentIds);
  if (countryId) q = q.eq("country_id", countryId);
  if (areaIds.length > 0) q = q.in("area_id", areaIds);
  if (placeId) q = q.eq("place_id", placeId);
  if (approval) q = q.eq("approval_status", approval);
  if (developmentId) q = q.eq("development_id", developmentId);
  if (types.length > 0) q = q.in("property_type", [...new Set(types.flatMap(typesForFilter))]);
  if (developmentIds.length > 0) q = q.in("development_id", developmentIds);
  if (approvals.length > 0) q = q.in("approval_status", approvals);
  if (availabilities.length > 0) {
    // "Needs confirmation" is a state, not a stored availability: the confirmation date has passed.
    const stored = availabilities.filter((a) => a !== "needs_confirmation");
    const overdue = availabilities.includes("needs_confirmation");
    if (overdue && stored.length > 0) {
      q = q.or(`availability.in.(${stored.join(",")}),availability_next_due_at.lt.${new Date().toISOString()}`);
    } else if (overdue) {
      q = q.lt("availability_next_due_at", new Date().toISOString());
    } else {
      q = q.in("availability", stored);
    }
  }
  if (minBedrooms != null) q = q.gte("bedrooms", minBedrooms);
  if (furnishing) q = q.eq("furnishing_status", furnishing);
  if (published != null) q = q.eq("is_published", published);
  if (search.trim()) {
    const term = `%${search.trim().replace(/[,()]/g, " ")}%`;
    q = q.or(`title.ilike.${term},reference_code.ilike.${term},location.ilike.${term}`);
  }
  return q;
}

/** A stable key for the filter object (arrays sorted) so equal filters share one cache entry. */
function filterKey(f: PropertyFilters) {
  return {
    ...f,
    agentIds: [...(f.agentIds ?? [])].sort(),
    areaIds: [...(f.areaIds ?? [])].sort(),
  };
}

export function useProperties(opts?: PropertyFilters) {
  const f = opts ?? {};
  return useQuery({
    queryKey: propertyKeys.list(filterKey(f)),
    queryFn: async (): Promise<Property[]> => {
      const q = applyPropertyFilters(
        sb.from("properties").select("*").order("created_at", { ascending: false }),
        f,
      );
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const PROPERTY_PAGE_SIZE = 50;

/**
 * One page of the inventory with the exact total. The database filters, sorts and slices; the browser only
 * ever holds the page it is showing, however large the inventory grows.
 */
export function usePropertiesPage(filters: PropertyFilters, page: number, pageSize = PROPERTY_PAGE_SIZE) {
  return useQuery({
    queryKey: [...propertyKeys.all, "page", filterKey(filters), page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: PropertyListRow[]; total: number }> => {
      const q = applyPropertyFilters(
        sb
          .from("properties")
          .select("*, developments(name)", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1),
        filters,
      );
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as PropertyListRow[], total: count ?? 0 };
    },
  });
}

/** Every property matching the filters, fetched in database-sized chunks, for export. Not used for rendering. */
export async function fetchPropertiesForExport(filters: PropertyFilters): Promise<PropertyListRow[]> {
  const out: PropertyListRow[] = [];
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const q = applyPropertyFilters(
      sb
        .from("properties")
        .select("*, developments(name)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + CHUNK - 1),
      filters,
    );
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as PropertyListRow[]));
    if (!data || data.length < CHUNK) break;
  }
  return out;
}

/**
 * How many properties each side (Sale / Rent) holds under the page's OTHER filters, for the tab
 * badges. Two cheap head-only count queries, so the numbers always match what the tab will show.
 */
export function usePropertyPurposeCounts(opts?: Omit<PropertyFilters, "purpose">) {
  const f = opts ?? {};
  return useQuery({
    queryKey: [...propertyKeys.all, "purpose-counts", filterKey(f)],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<PropertyPurposeTab, number>> => {
      const count = async (purpose: PropertyPurposeTab) => {
        const { count: n, error } = await applyPropertyFilters(
          sb.from("properties").select("id", { count: "exact", head: true }),
          { ...f, purpose },
        );
        if (error) throw error;
        return n ?? 0;
      };
      const [sale, rent] = await Promise.all([count("sale"), count("rent")]);
      return { sale, rent };
    },
  });
}

/** Properties waiting for an Administrator, for the review banner. */
/**
 * How many properties each status tab (Active, Sold, Rented, Archived, All) holds under the page's other
 * filters and the chosen Sale or Rent side. One cheap head-only count per tab, using the same filter
 * definition as the list, so a tab's number always matches what it will show.
 */
export function usePropertyStatusCounts(
  filters: Omit<PropertyFilters, "purpose" | "status" | "availability">,
  purpose: PropertyPurposeTab,
) {
  return useQuery({
    queryKey: [...propertyKeys.all, "status-counts", filterKey(filters as PropertyFilters), purpose],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<PropertyStatusTab, number>> => {
      const entries = await Promise.all(
        PROPERTY_STATUS_TABS.map(async (tab) => {
          const q = applyPropertyFilters(
            sb.from("properties").select("id", { count: "exact", head: true }),
            withStatusTab({ ...filters, purpose } as PropertyFilters, tab.value),
          );
          const { count, error } = await q;
          if (error) throw error;
          return [tab.value, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<PropertyStatusTab, number>;
    },
  });
}

export function usePendingApprovalCount(enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...propertyKeys.all, "pending-approval-count"],
    staleTime: 20_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export type ApprovalEvent = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_team_member_id: string | null;
  created_at: string;
};

export function usePropertyApprovalEvents(propertyId: string | undefined) {
  return useQuery({
    enabled: !!propertyId,
    queryKey: [...propertyKeys.all, "approval-events", propertyId ?? "none"],
    queryFn: async (): Promise<ApprovalEvent[]> => {
      const { data, error } = await sb
        .from("property_approval_events")
        .select("id, action, from_status, to_status, note, actor_team_member_id, created_at")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalEvent[];
    },
  });
}

/** Approve, reject or return a property for changes. Allowed only for people with the approve permission. */
export function useReviewProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: "approve" | "reject" | "return"; note?: string }) => {
      const { error } = await sb.rpc("review_property", {
        _property_id: input.id,
        _decision: input.decision,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  });
}

export function useResubmitProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; note?: string }) => {
      const { error } = await sb.rpc("resubmit_property", { _property_id: input.id, _note: input.note ?? undefined });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
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

/** The hero photo of each property (or its first photo), as a displayable URL, for list and grid thumbnails. */
export function usePropertyThumbnails(propertyIds: string[]) {
  const ids = [...propertyIds].sort();
  return useQuery({
    queryKey: [...propertyKeys.all, "thumbnails", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await sb
        .from("property_media")
        .select("property_id, display_order, is_hero, uploads(id, storage_provider, storage_bucket, storage_path, public_url)")
        .in("property_id", ids)
        .eq("media_type", "image")
        // The hero first, then gallery order, so the first row per property is the photo to show.
        .order("is_hero", { ascending: false })
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
    mutationFn: async ({ mediaId }: { propertyId: string; mediaId: string }) => {
      // One database step: marks this photo as the hero, clears the others and updates the property's hero address.
      const { error } = await sb.rpc("set_property_hero", { _media_id: mediaId });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => refreshPropertyImages(qc, vars.propertyId),
  });
}

/** Everything that shows a property's photos: the gallery, the hero, list thumbnails and the property itself. */
function refreshPropertyImages(qc: ReturnType<typeof useQueryClient>, propertyId: string) {
  qc.invalidateQueries({ queryKey: propertyKeys.media(propertyId) });
  qc.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
  qc.invalidateQueries({ queryKey: propertyKeys.all });
  qc.invalidateQueries({ queryKey: ["uploads"] });
}

/**
 * Adds an uploaded photo to a property's gallery. The database gives it the next position (safe when several
 * photos arrive together) and makes it the hero when the property has none, or when asked. It resolves only
 * when the photo is really in the gallery.
 */
export function useAddPropertyMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      uploadId,
      makeHero,
    }: {
      propertyId: string;
      uploadId: string;
      makeHero?: boolean;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("add_property_media", {
        _property_id: propertyId,
        _upload_id: uploadId,
        _make_hero: !!makeHero,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => refreshPropertyImages(qc, vars.propertyId),
  });
}

/** Puts the gallery in the given order (ids of property_media rows, first to last). */
export function useReorderPropertyMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, orderedIds }: { propertyId: string; orderedIds: string[] }) => {
      const { error } = await sb.rpc("reorder_property_media", { _property_id: propertyId, _ordered_ids: orderedIds });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => refreshPropertyImages(qc, vars.propertyId),
  });
}

/** Takes a photo out of the gallery (the next photo becomes the hero if it was the hero) and returns its upload id. */
export function useRemovePropertyMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mediaId }: { propertyId: string; mediaId: string }): Promise<string> => {
      const { data, error } = await sb.rpc("remove_property_media", { _media_id: mediaId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => refreshPropertyImages(qc, vars.propertyId),
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

/**
 * Live preview of the reference code a new/edited property will get once saved. Needs an owner and an agent.
 * The reference is built from the owner code and the agent code (OWNER+AGENT-YY-SEQUENCE), never from a
 * development. Purely informational: the real value is reserved server-side on insert, and an issued reference
 * is permanent.
 */
export function usePropertyReferencePreview(
  ownerId: string | null | undefined,
  agentId: string | null | undefined,
  developmentId?: string | null,
) {
  return useQuery({
    queryKey: ["properties", "reference-preview", ownerId ?? "none", agentId ?? "none", developmentId ?? "none"],
    enabled: !!ownerId && !!agentId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.rpc("preview_property_reference_for", {
        _owner_id: ownerId!,
        _agent_id: agentId!,
        _development_id: developmentId ?? undefined,
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
