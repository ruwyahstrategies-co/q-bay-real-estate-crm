import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPERTY_STATUS_TABS,
  statusTabQuery,
  tabOwnsAvailability,
  withStatusTab,
} from "../property-status-tabs";
import { EMPTY_PROPERTY_FILTERS, propertyQueryFrom } from "../list-filters";

test("the page offers Active, Sold, Rented, Archived and All", () => {
  assert.deepEqual(
    PROPERTY_STATUS_TABS.map((t) => t.label),
    ["Active", "Sold", "Rented", "Archived", "All"],
  );
});

test("Sold and Rented use availability and look across archive states; the rest use the archive state", () => {
  assert.deepEqual(statusTabQuery("active"), { status: "active" });
  assert.deepEqual(statusTabQuery("archived"), { status: "archived" });
  assert.deepEqual(statusTabQuery("all"), { status: "all" });
  assert.deepEqual(statusTabQuery("sold"), { status: "all", availabilities: ["sold"] });
  assert.deepEqual(statusTabQuery("rented"), { status: "all", availabilities: ["rented"] });
  assert.equal(tabOwnsAvailability("sold"), true);
  assert.equal(tabOwnsAvailability("rented"), true);
  assert.equal(tabOwnsAvailability("active"), false);
});

test("the Sold tab overrides the drawer's availability, other tabs keep it", () => {
  const sold = propertyQueryFrom({ ...EMPTY_PROPERTY_FILTERS, archive: "sold", availabilities: ["available"] });
  assert.deepEqual(sold.availabilities, ["sold"]);
  assert.equal(sold.status, "all");

  const active = propertyQueryFrom({ ...EMPTY_PROPERTY_FILTERS, archive: "active", availabilities: ["reserved"] });
  assert.deepEqual(active.availabilities, ["reserved"]);
  assert.equal(active.status, "active");

  const archived = propertyQueryFrom({ ...EMPTY_PROPERTY_FILTERS, archive: "archived" });
  assert.equal(archived.status, "archived");
  assert.deepEqual(archived.availabilities, []);
});

test("withStatusTab leaves every other filter alone", () => {
  const base = { status: "active", availabilities: ["available"], agentIds: ["a"] };
  const out = withStatusTab(base, "rented");
  assert.deepEqual(out.availabilities, ["rented"]);
  assert.deepEqual(out.agentIds, ["a"]);
  const kept = withStatusTab(base, "archived");
  assert.deepEqual(kept.availabilities, ["available"]);
  assert.equal(kept.status, "archived");
});
