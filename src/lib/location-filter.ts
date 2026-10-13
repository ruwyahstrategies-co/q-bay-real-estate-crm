/** Country -> Area -> Place selection used by list-page filters. */
export type LocationFilterValue = {
  countryId: string | null;
  areaId: string | null;
  placeId: string | null;
};

export const EMPTY_LOCATION_FILTER: LocationFilterValue = { countryId: null, areaId: null, placeId: null };
