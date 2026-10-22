// What a lead's budget can honestly be used for.
//
// A lead's budget is what a buyer or renter says they could spend. Adding the maximum budgets of open leads
// gives an upper bound on what the open leads might be worth, not revenue and not a forecast: most leads have
// no budget at all, a few outliers can dominate the total, a sale budget (a purchase price) and a rent budget
// (an amount per period) must never be added together, and different currencies must never be mixed.

export type BudgetLead = {
  budget_max: number | null;
  currency: string | null;
  transaction_intent: string | null;
};

export type BudgetGroup = {
  intent: "sale" | "rent";
  currency: string;
  /** Sum of the maximum budget of leads that have one. */
  total: number;
  /** Leads in this group that have a budget. */
  withBudget: number;
  /** All leads in this group, with or without a budget. */
  leads: number;
  /** The single biggest budget, so an outlier is visible. */
  largest: number;
};

const norm = (v: string | null | undefined) => (v || "").trim().toUpperCase();

/** Sale and rent budgets, kept apart, one group per currency. Leads without a budget still count as leads. */
export function summariseBudgets(leads: BudgetLead[]): BudgetGroup[] {
  const groups = new Map<string, BudgetGroup>();
  for (const l of leads) {
    const intent = l.transaction_intent === "rent" ? "rent" : "sale";
    const currency = norm(l.currency) || "QAR";
    const key = `${intent}:${currency}`;
    const g = groups.get(key) ?? { intent, currency, total: 0, withBudget: 0, leads: 0, largest: 0 };
    g.leads += 1;
    if (l.budget_max != null && Number.isFinite(l.budget_max) && l.budget_max > 0) {
      g.total += l.budget_max;
      g.withBudget += 1;
      g.largest = Math.max(g.largest, l.budget_max);
    }
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.intent === b.intent ? b.total - a.total : a.intent === "sale" ? -1 : 1,
  );
}

/** The share of a group's total that comes from its single biggest budget, 0 to 100. */
export function largestShare(g: BudgetGroup): number {
  return g.total > 0 ? Math.round((g.largest / g.total) * 100) : 0;
}

/** True when one budget is more than half the total of a group with several budgets. */
export function hasDominantBudget(g: BudgetGroup): boolean {
  return g.withBudget > 1 && largestShare(g) > 50;
}
