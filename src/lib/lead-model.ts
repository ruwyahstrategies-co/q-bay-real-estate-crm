// The lead vocabulary that has no dependency on the database client, so it can be shared by the
// app (through "@/lib/db", which re-exports it) and by plain modules such as the lead importer.

export const LEAD_CLASSIFICATIONS = ["buyer", "renter", "owner", "investor", "commercial"] as const;
export const LEAD_CLASSIFICATION_LABELS: Record<string, string> = {
  buyer: "Buyer",
  renter: "Renter",
  owner: "Property Owner",
  investor: "Investor",
  commercial: "Commercial",
  tenant: "Renter", // legacy value from earlier demo data, treated as an alias of "renter"
};
export const LEAD_WORKFLOWS = ["sales", "telesales"] as const;

/** Top-level lead split: what the lead wants to do. Stored in leads.transaction_intent. */
export const LEAD_INTENTS = ["sale", "rent"] as const;
export type LeadIntent = (typeof LEAD_INTENTS)[number];
export const LEAD_INTENT_LABELS: Record<LeadIntent, string> = { sale: "Sale", rent: "Rent" };

/**
 * Classifications offered under each intent. Investor, Commercial and Property Owner are
 * available under both; Buyer only makes sense for Sale and Renter only for Rent.
 */
export function classificationsForIntent(intent: LeadIntent): readonly string[] {
  return intent === "rent"
    ? ["renter", "investor", "commercial", "owner"]
    : ["buyer", "investor", "commercial", "owner"];
}

/** The classification a lead gets when nothing more specific is known. */
export function defaultClassificationForIntent(intent: LeadIntent): string {
  return intent === "rent" ? "renter" : "buyer";
}

/**
 * Terminal outcomes recorded on a lead in addition to its pipeline stage. Kept as a list so
 * further closed/lost reasons can be added next to this one (and to leads_outcome_check).
 */
export const LEAD_OUTCOMES = ["rented_from_outside"] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];
export const LEAD_OUTCOME_LABELS: Record<LeadOutcome, string> = {
  rented_from_outside: "Rented from Outside",
};
