// The status tabs on the Properties page: Active, Sold, Rented, Archived, All.
//
// Active, Archived and All come from the archive state (properties.status). Sold and Rented come from the
// property's availability, which is what a closed deal sets, and they look across archive states: a sold
// property stays sold whether or not it was later archived. Sale and Rent (the listing purpose) is a separate
// switch that combines with any tab.

export type PropertyStatusTab = "active" | "sold" | "rented" | "archived" | "all";

export const PROPERTY_STATUS_TABS: { value: PropertyStatusTab; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "sold", label: "Sold" },
  { value: "rented", label: "Rented" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export type StatusTabQuery = {
  status: "active" | "archived" | "all";
  /** Set only by Sold and Rented. Other tabs leave availability to the filters drawer. */
  availabilities?: string[];
};

export function statusTabQuery(tab: PropertyStatusTab): StatusTabQuery {
  switch (tab) {
    case "active":
      return { status: "active" };
    case "archived":
      return { status: "archived" };
    case "sold":
      return { status: "all", availabilities: ["sold"] };
    case "rented":
      return { status: "all", availabilities: ["rented"] };
    case "all":
      return { status: "all" };
  }
}

/** True for the tabs that decide availability themselves, so the drawer's availability choice is set aside. */
export function tabOwnsAvailability(tab: PropertyStatusTab): boolean {
  return tab === "sold" || tab === "rented";
}

/** Applies a tab to a set of filters: the tab's status always, and its availability when it has one. */
export function withStatusTab<T extends { status?: string; availabilities?: string[] }>(
  filters: T,
  tab: PropertyStatusTab,
): T {
  const q = statusTabQuery(tab);
  return { ...filters, status: q.status, ...(q.availabilities ? { availabilities: q.availabilities } : {}) };
}
