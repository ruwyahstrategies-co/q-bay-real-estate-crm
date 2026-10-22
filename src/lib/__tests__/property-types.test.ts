import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPERTY_TYPE_FILTER_OPTIONS,
  PROPERTY_TYPES,
  isVillaType,
  propertyTypeChoices,
  typesForFilter,
} from "../property-types";
import { developmentStatusChoices, developmentStatusLabel } from "../development-status";

test("new properties choose Villa Standalone or Villa Compound, never plain Villa", () => {
  assert.ok(PROPERTY_TYPES.includes("Villa Standalone"));
  assert.ok(PROPERTY_TYPES.includes("Villa Compound"));
  assert.ok(!(PROPERTY_TYPES as readonly string[]).includes("Villa"));
});

test("a property already saved as plain Villa keeps showing it until it is reclassified", () => {
  assert.ok(propertyTypeChoices("Villa").includes("Villa"));
  assert.ok(!propertyTypeChoices("Apartment").includes("Villa"));
  assert.ok(!propertyTypeChoices(null).includes("Villa"));
});

test("every kind of villa gets the villa details block", () => {
  assert.equal(isVillaType("Villa"), true);
  assert.equal(isVillaType("Villa Standalone"), true);
  assert.equal(isVillaType("villa compound"), true);
  assert.equal(isVillaType("Apartment"), false);
  assert.equal(isVillaType(null), false);
});

test("filtering for Villa covers all villas, a specific kind covers only itself", () => {
  assert.deepEqual(typesForFilter("Villa").sort(), ["Villa", "Villa Compound", "Villa Standalone"]);
  assert.deepEqual(typesForFilter("Villa Compound"), ["Villa Compound"]);
  assert.deepEqual(typesForFilter("Plot"), ["Plot"]);
  assert.ok(PROPERTY_TYPE_FILTER_OPTIONS.includes("Villa"));
});

test("Under construction cannot be chosen as a development status but still displays", () => {
  const values = developmentStatusChoices("off_plan").map((o) => o.value);
  assert.deepEqual(values, ["off_plan", "ready"]);
  assert.ok(developmentStatusChoices("under_construction").some((o) => o.value === "under_construction"));
  assert.equal(developmentStatusLabel("under_construction"), "Under construction");
  assert.equal(developmentStatusLabel("ready"), "Ready");
});
