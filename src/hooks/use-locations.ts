import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type Country, type CountryInsert, type Area, type AreaInsert } from "@/lib/db";

export const locationKeys = {
  countries: ["locations", "countries"] as const,
  areas: (countryId?: string) => ["locations", "areas", countryId ?? "all"] as const,
};

export function useCountries() {
  return useQuery({
    queryKey: locationKeys.countries,
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await sb.from("countries").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAreas(countryId?: string) {
  return useQuery({
    queryKey: locationKeys.areas(countryId),
    queryFn: async (): Promise<Area[]> => {
      let q = sb.from("areas").select("*").order("display_order", { ascending: true });
      if (countryId) q = q.eq("country_id", countryId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CountryInsert) => {
      const { data, error } = await sb.from("countries").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationKeys.countries }),
  });
}

export function useUpdateCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Country> }) => {
      const { data, error } = await sb.from("countries").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationKeys.countries }),
  });
}

export function useCreateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AreaInsert) => {
      const { data, error } = await sb.from("areas").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations", "areas"] }),
  });
}

export function useUpdateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Area> }) => {
      const { data, error } = await sb.from("areas").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations", "areas"] }),
  });
}
