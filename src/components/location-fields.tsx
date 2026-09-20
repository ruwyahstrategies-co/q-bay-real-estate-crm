import { useMemo } from "react";
import { SelectField } from "./select-field";
import { useCountries, useAreas, usePlaces } from "@/hooks/use-locations";

export type LocationValue = {
  countryId: string | null;
  areaId: string | null;
  placeId: string | null;
};

const labelCls = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/**
 * Country -> Area -> Place cascade used by every record that carries a
 * location. Choosing a country narrows the areas, choosing an area narrows
 * the places, and changing a level clears the levels below it. Only active
 * options are offered, except the currently saved value, so editing an old
 * record never silently drops its location. Legacy rows that stored an area
 * without a country still resolve their country from the area.
 *
 * Renders three <label> cells with no wrapper so it drops into the caller's
 * existing grid.
 */
export function CountryAreaPlaceFields({
  value,
  onChange,
  fullWidth,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** Span the full row on sm+ grids (each cell takes a whole line). */
  fullWidth?: boolean;
}) {
  const { data: countries = [] } = useCountries();
  const { data: areas = [] } = useAreas();
  const { data: places = [] } = usePlaces();

  const effectiveCountryId =
    value.countryId || areas.find((a) => a.id === value.areaId)?.country_id || null;

  const countryOptions = useMemo(
    () =>
      countries
        .filter((c) => c.is_active || c.id === effectiveCountryId)
        .map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (inactive)` })),
    [countries, effectiveCountryId],
  );
  const areaOptions = useMemo(
    () =>
      areas
        .filter((a) => a.country_id === effectiveCountryId && (a.is_active || a.id === value.areaId))
        .map((a) => ({ value: a.id, label: a.is_active ? a.name : `${a.name} (inactive)` })),
    [areas, effectiveCountryId, value.areaId],
  );
  const placeOptions = useMemo(
    () =>
      places
        .filter((p) => p.area_id === value.areaId && (p.is_active || p.id === value.placeId))
        .map((p) => ({ value: p.id, label: p.is_active ? p.name : `${p.name} (inactive)` })),
    [places, value.areaId, value.placeId],
  );

  const span = fullWidth ? "sm:col-span-2" : undefined;

  return (
    <>
      <label className={`flex flex-col gap-1.5 ${span ?? ""}`}>
        <span className={labelCls}>Country</span>
        <SelectField
          value={effectiveCountryId}
          onChange={(v) => onChange({ countryId: v, areaId: null, placeId: null })}
          options={countryOptions}
          placeholder="Select country"
          emptyLabel="No country"
        />
      </label>
      <label className={`flex flex-col gap-1.5 ${span ?? ""}`}>
        <span className={labelCls}>Area</span>
        <SelectField
          value={value.areaId}
          onChange={(v) => onChange({ countryId: effectiveCountryId, areaId: v, placeId: null })}
          options={areaOptions}
          placeholder={effectiveCountryId ? "Select area" : "Select a country first"}
          emptyLabel="No area"
          disabled={!effectiveCountryId}
        />
      </label>
      <label className={`flex flex-col gap-1.5 ${span ?? ""}`}>
        <span className={labelCls}>Place (optional)</span>
        <SelectField
          value={value.placeId}
          onChange={(v) => onChange({ countryId: effectiveCountryId, areaId: value.areaId, placeId: v })}
          options={placeOptions}
          placeholder={
            !value.areaId
              ? "Select an area first"
              : placeOptions.length === 0
                ? "No places in this area"
                : "Select place"
          }
          emptyLabel="No place"
          disabled={!value.areaId || placeOptions.length === 0}
        />
      </label>
    </>
  );
}
