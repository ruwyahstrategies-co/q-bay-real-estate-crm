import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_LEAD_FILTERS,
  EMPTY_PROPERTY_FILTERS,
  dateRangeProblem,
  leadFilterCount,
  leadFilterProblems,
  leadQueryFrom,
  parseAmount,
  propertyFilterCount,
  propertyFilterProblems,
  propertyQueryFrom,
} from "../list-filters";

test("amounts: blanks and junk mean no limit, commas are ignored", () => {
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("  "), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseAmount("1,250,000"), 1250000);
  assert.equal(parseAmount("0"), 0);
});

test("an empty filter set counts as zero and a group counts once however many choices it has", () => {
  assert.equal(leadFilterCount(EMPTY_LEAD_FILTERS), 0);
  assert.equal(
    leadFilterCount({ ...EMPTY_LEAD_FILTERS, stages: ["new", "contacted", "viewing"] }),
    1,
  );
  assert.equal(
    leadFilterCount({
      ...EMPTY_LEAD_FILTERS,
      stages: ["new"],
      agents: ["a", "b"],
      budgetMin: "100",
      createdFrom: "2026-10-01",
    }),
    4,
  );
  assert.equal(propertyFilterCount(EMPTY_PROPERTY_FILTERS), 0);
  assert.equal(
    propertyFilterCount({ ...EMPTY_PROPERTY_FILTERS, archive: "all", areaIds: ["x", "y"] }),
    2,
  );
});

test("a contradictory range is reported and left out of the query instead of returning nothing", () => {
  const bad = {
    ...EMPTY_LEAD_FILTERS,
    budgetMin: "900",
    budgetMax: "100",
    createdFrom: "2026-10-20",
    createdTo: "2026-10-01",
  };
  assert.equal(leadFilterProblems(bad).length, 2);
  const q = leadQueryFrom(bad, null);
  assert.equal(q.budgetMin, null);
  assert.equal(q.budgetMax, null);
  assert.equal(q.createdFrom, null);
  assert.equal(q.createdTo, null);

  const ok = leadQueryFrom(
    { ...EMPTY_LEAD_FILTERS, budgetMin: "100", budgetMax: "900", createdFrom: "2026-10-01" },
    null,
  );
  assert.equal(ok.budgetMin, 100);
  assert.equal(ok.budgetMax, 900);
  assert.equal(ok.createdFrom, "2026-10-01");
  assert.equal(dateRangeProblem("2026-10-01", "2026-10-01"), null);

  const badP = { ...EMPTY_PROPERTY_FILTERS, minPrice: "5", maxPrice: "1" };
  assert.equal(propertyFilterProblems(badP).length, 1);
  assert.equal(propertyQueryFrom(badP).minPrice, null);
});

test("multi-choice filters reach the query, and a custom field only when a field and value are set", () => {
  const q = leadQueryFrom(
    {
      ...EMPTY_LEAD_FILTERS,
      stages: ["a", "b"],
      agents: ["x"],
      sources: ["Website"],
      customKey: "k",
      customValue: "v",
    },
    "select",
  );
  assert.deepEqual(q.stages, ["a", "b"]);
  assert.deepEqual(q.agents, ["x"]);
  assert.deepEqual(q.sources, ["Website"]);
  assert.deepEqual(q.customField, { key: "k", type: "select", value: "v" });
  assert.equal(
    leadQueryFrom({ ...EMPTY_LEAD_FILTERS, customKey: "k" }, "select").customField,
    null,
  );
});

test("property filters: a place only counts under a single area, website flag becomes a boolean", () => {
  const two = propertyQueryFrom({ ...EMPTY_PROPERTY_FILTERS, areaIds: ["a", "b"], placeId: "p" });
  assert.equal(two.placeId, null);
  const one = propertyQueryFrom({
    ...EMPTY_PROPERTY_FILTERS,
    areaIds: ["a"],
    placeId: "p",
    published: "no",
    minBedrooms: "3",
  });
  assert.equal(one.placeId, "p");
  assert.equal(one.published, false);
  assert.equal(one.minBedrooms, 3);
  assert.equal(propertyQueryFrom(EMPTY_PROPERTY_FILTERS).published, null);
  assert.equal(propertyQueryFrom(EMPTY_PROPERTY_FILTERS).status, "active");
});
