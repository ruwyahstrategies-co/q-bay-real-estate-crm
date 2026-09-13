import type { Lead } from "./db";

// Mirrors public.lead_time_proximity_factor / public.lead_effective_intent_score
// (see supabase/migrations/20260912235814_lead_transaction_timeline_and_effective_intent.sql).
// The base intent score in this app comes from the latest completed AI
// analysis per lead (ai_analyses.output_json), not a column read directly in
// a query, so the blend has to happen client-side wherever that base score is
// already being read - this keeps AI lead intelligence fully in control of
// the base number while layering in a deterministic, always-current
// time-proximity component on top.
export function leadTimeProximityFactor(
  lead: Pick<Lead, "intended_transaction_date" | "transaction_timeframe">,
): number {
  if (lead.intended_transaction_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(lead.intended_transaction_date);
    const daysOut = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    if (daysOut <= 0) return 1.0;
    return Math.max(0.4, 1.0 - (Math.min(daysOut, 180) / 180) * 0.6);
  }
  switch (lead.transaction_timeframe) {
    case "immediate":
      return 1.0;
    case "1_month":
      return 0.9;
    case "3_months":
      return 0.75;
    case "6_months":
      return 0.6;
    case "12_months":
      return 0.45;
    default:
      return 0.7; // unspecified/unset: neutral, no penalty for missing timeline data
  }
}

/** Base behavioural intent (0-100, usually from the latest AI analysis) blended with time-proximity. */
export function effectiveIntentScore(
  baseIntentScore: number,
  lead: Pick<Lead, "intended_transaction_date" | "transaction_timeframe">,
): number {
  const factor = leadTimeProximityFactor(lead);
  return Math.round(Math.min(100, baseIntentScore * (0.7 + 0.3 * factor)) * 10) / 10;
}
