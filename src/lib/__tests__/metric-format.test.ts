import { test } from "node:test";
import assert from "node:assert/strict";
import { metricMoney } from "../metric-format";
import { hasDominantBudget, largestShare, summariseBudgets } from "../lead-budgets";

test("large amounts are shortened and the exact amount is kept", () => {
  const m = metricMoney(101_734_500, "QAR");
  assert.equal(m.value, "QAR 101.7M");
  assert.equal(m.exact, "QAR 101,734,500");
  assert.equal(m.shortened, true);
  assert.ok(!m.value.includes("\n"));
});

test("smaller amounts are shown in full, one line, no shortening", () => {
  const m = metricMoney(925_000, "QAR");
  assert.equal(m.value, "QAR 925,000");
  assert.equal(m.shortened, false);
  assert.equal(metricMoney(0, "QAR").value, "QAR 0");
});

test("a missing or invalid amount is a dash, never NaN or undefined", () => {
  for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(metricMoney(bad as never, "QAR").value, "-");
  }
  assert.equal(metricMoney(1_500_000_000, "QAR").value, "QAR 1.5B");
});

test("currency defaults to QAR and is upper-cased", () => {
  assert.equal(metricMoney(2_000_000, null).exact, "QAR 2,000,000");
  assert.match(metricMoney(2_000_000, "usd").exact, /^USD /);
});

test("budgets: sale and rent are never added together, currencies are never mixed", () => {
  const groups = summariseBudgets([
    { budget_max: 4_000_000, currency: "QAR", transaction_intent: "sale" },
    { budget_max: 1_000_000, currency: "QAR", transaction_intent: "sale" },
    { budget_max: null, currency: "QAR", transaction_intent: "sale" },
    { budget_max: 9_000, currency: "QAR", transaction_intent: "rent" },
    { budget_max: 500_000, currency: "USD", transaction_intent: "sale" },
    { budget_max: 0, currency: "QAR", transaction_intent: null },
  ]);
  const sale = groups.find((g) => g.intent === "sale" && g.currency === "QAR")!;
  assert.equal(sale.total, 5_000_000);
  assert.equal(sale.withBudget, 2);
  assert.equal(sale.leads, 4, "leads without a budget still count as leads");
  assert.equal(groups.find((g) => g.intent === "rent")!.total, 9_000);
  assert.equal(groups.find((g) => g.currency === "USD")!.total, 500_000);
  // Sale groups come before rent groups.
  assert.equal(groups[groups.length - 1].intent, "rent");
});

test("one outlier budget is flagged", () => {
  const [g] = summariseBudgets([
    { budget_max: 53_000_000, currency: "QAR", transaction_intent: "sale" },
    { budget_max: 5_000_000, currency: "QAR", transaction_intent: "sale" },
    { budget_max: 4_500_000, currency: "QAR", transaction_intent: "sale" },
  ]);
  assert.equal(largestShare(g), 85);
  assert.equal(hasDominantBudget(g), true);
  const [even] = summariseBudgets([
    { budget_max: 1, currency: "QAR", transaction_intent: "sale" },
    { budget_max: 1, currency: "QAR", transaction_intent: "sale" },
  ]);
  assert.equal(hasDominantBudget(even), false);
});
