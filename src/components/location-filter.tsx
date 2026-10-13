import { useMemo } from "react";
import { FilterSelect } from "@/components/filter-toolbar";
import { useCountries, useAreas, usePlaces } from "@/hooks/use-locations";
import type { LocationFilterValue } from "@/lib/location-filter";

/**
 * Country -> Area -> Place filters. Same cascade rules as the record form: picking a country
 * narrows the areas, picking an area narrows the places, and changing a level clears the levels
 * below it, so the three values can never contradict each other. Inactive locations stay
 * selectable here (records may still sit on them) and are marked.
 */
export function LocationFilterSelects({
  value,
  onChange,
}: {
  value: LocationFilterValue;
  onChange: (next: LocationFilterValue) => void;
}) {
  const { data: countries = [] } = useCountries();
  const { data: areas = [] } = useAreas();
  const { data: places = [] } = usePlaces();

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (inactive)` })),
    [countries],
  );
  const areaOptions = useMemo(
    () =>
      areas
        .filter((a) => a.country_id === value.countryId)
        .map((a) => ({ value: a.id, label: a.is_active ? a.name : `${a.name} (inactive)` })),
    [areas, value.countryId],
  );
  const placeOptions = useMemo(
    () =>
      places
        .filter((p) => p.area_id === value.areaId)
        .map((p) => ({ value: p.id, label: p.is_active ? p.name : `${p.name} (inactive)` })),
    [places, value.areaId],
  );

  return (
    <>
      <FilterSelect
        label="Country"
        value={value.countryId}
        onChange={(v) => onChange({ countryId: v, areaId: null, placeId: null })}
        options={countryOptions}
        allLabel="All countries"
      />
      <FilterSelect
        label="Area"
        value={value.areaId}
        onChange={(v) => onChange({ countryId: value.countryId, areaId: v, placeId: null })}
        options={areaOptions}
        allLabel={value.countryId ? "All areas" : "Area (pick a country)"}
        disabled={!value.countryId}
      />
      <FilterSelect
        label="Place"
        value={value.placeId}
        onChange={(v) => onChange({ countryId: value.countryId, areaId: value.areaId, placeId: v })}
        options={placeOptions}
        allLabel={!value.areaId ? "Place (pick an area)" : placeOptions.length === 0 ? "No places in this area" : "All places"}
        disabled={!value.areaId || placeOptions.length === 0}
      />
    </>
  );
}
