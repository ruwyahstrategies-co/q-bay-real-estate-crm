import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db";

// Server-side property search for pickers. Only one page of results is ever fetched, so this works the same
// with 100 properties or 20,000. Search matches reference, title, location, development, area, tower and unit.

export type PickerProperty = {
  id: string;
  reference_code: string | null;
  title: string;
  location: string | null;
  development_name: string | null;
  area_name: string | null;
  price: number | null;
  currency: string | null;
  purpose: string | null;
  property_type: string | null;
  bedrooms: number | null;
  approval_status: string;
};

export const PICKER_PAGE_SIZE = 8;

export function usePropertyPickerSearch(opts: {
  query: string;
  page: number;
  pageSize?: number;
  purpose?: "sale" | "rent" | null;
  enabled?: boolean;
}) {
  const { query, page, pageSize = PICKER_PAGE_SIZE, purpose = null, enabled = true } = opts;
  const term = query.trim();
  return useQuery({
    enabled,
    queryKey: ["properties", "picker", { term, page, pageSize, purpose }],
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<{ rows: PickerProperty[]; total: number }> => {
      const { data, error } = await sb.rpc("search_properties_for_picker", {
        _query: term || undefined,
        _limit: pageSize,
        _offset: page * pageSize,
        _purpose: purpose ?? undefined,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as (PickerProperty & { total_count: number })[];
      return { rows, total: rows[0] ? Number(rows[0].total_count) : 0 };
    },
  });
}

export type PropertyBrief = {
  id: string;
  reference_code: string | null;
  title: string;
  location: string | null;
  price: number | null;
  currency: string | null;
};

const BRIEF_CHUNK = 60;

/** Labels for already-chosen property ids (so selections made on other pages still show their name). */
export function usePropertyBriefs(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ["properties", "briefs", key],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, PropertyBrief>> => {
      const out = new Map<string, PropertyBrief>();
      for (let i = 0; i < ids.length; i += BRIEF_CHUNK) {
        const { data, error } = await sb
          .from("properties")
          .select("id, reference_code, title, location, price, currency")
          .in("id", ids.slice(i, i + BRIEF_CHUNK));
        if (error) throw error;
        for (const row of data ?? []) out.set(row.id, row as PropertyBrief);
      }
      return out;
    },
  });
}
