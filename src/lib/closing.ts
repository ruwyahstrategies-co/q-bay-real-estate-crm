// The closing form for a Won / Sold / Rented deal: defaults, commission and validation.
//
// close_lead_deal (database) is the authority and checks everything again. This mirrors its rules so a
// mistake is shown next to the field instead of after a round trip.

export type ClosingType = "sale" | "rental";

export const CLOSING_TYPES: { value: ClosingType; label: string }[] = [
  { value: "sale", label: "Sale" },
  { value: "rental", label: "Rental" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
] as const;

export type ClosingValues = {
  property_id: string;
  transaction_type: ClosingType;
  /** yyyy-mm-dd */
  closing_date: string;
  price: string;
  currency: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  payment_method: string;
  payment_status: string;
  payment_details: string;
  commission_rate: string;
  commission_amount: string;
  notes: string;
};

/** Sale for sale-type listings, rental for rent, and the lead's own intent when the listing could be either. */
export function closingTypeFor(
  propertyPurpose: string | null | undefined,
  leadIntent: string | null | undefined,
): ClosingType {
  if (propertyPurpose === "rent") return "rental";
  if (
    propertyPurpose === "sale" ||
    propertyPurpose === "off_plan" ||
    propertyPurpose === "off_plan_resale"
  )
    return "sale";
  return leadIntent === "rent" ? "rental" : "sale";
}

/** Commission for a rate in percent, rounded to whole currency units; null when it cannot be worked out. */
export function commissionFor(price: number | null, ratePercent: number | null): number | null {
  if (
    price == null ||
    ratePercent == null ||
    !Number.isFinite(price) ||
    !Number.isFinite(ratePercent)
  )
    return null;
  if (price <= 0 || ratePercent < 0 || ratePercent > 100) return null;
  return Math.round((price * ratePercent) / 100);
}

export function toNumber(text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type DefaultsInput = {
  lead: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    transaction_intent: string | null;
  };
  property?: {
    id: string;
    price: number | null;
    currency: string | null;
    purpose: string | null;
  } | null;
  /** The agreed amount of the latest accepted offer on this property, when there is one. */
  offerAmount?: number | null;
  todayIso: string;
};

export function closingDefaults({
  lead,
  property,
  offerAmount,
  todayIso,
}: DefaultsInput): ClosingValues {
  const price = offerAmount ?? property?.price ?? null;
  return {
    property_id: property?.id ?? "",
    transaction_type: closingTypeFor(property?.purpose, lead.transaction_intent),
    closing_date: todayIso,
    price: price != null ? String(price) : "",
    currency: property?.currency || "QAR",
    client_name: lead.full_name ?? "",
    client_phone: lead.phone ?? "",
    client_email: lead.email ?? "",
    payment_method: "",
    payment_status: "",
    payment_details: "",
    commission_rate: "",
    commission_amount: "",
    notes: "",
  };
}

export type ClosingErrors = Partial<Record<keyof ClosingValues, string>>;

/** Everything that would make the database refuse the deal, field by field. Empty means ready to send. */
export function validateClosing(v: ClosingValues, todayIso: string): ClosingErrors {
  const e: ClosingErrors = {};
  if (!v.property_id) e.property_id = "Choose the property that was sold or rented.";
  if (!v.closing_date) e.closing_date = "The actual transaction date is required.";
  else if (v.closing_date > todayIso)
    e.closing_date = "The transaction date cannot be in the future.";
  const price = toNumber(v.price);
  if (price == null || price <= 0) e.price = "The agreed price is required.";
  if (!v.client_name.trim()) e.client_name = "The client name is required.";
  if (!v.client_phone.trim()) e.client_phone = "The client phone number is required.";
  if (!v.payment_method) e.payment_method = "Choose how the client paid.";
  if (!v.payment_status) e.payment_status = "Choose the payment status.";
  const rate = v.commission_rate.trim() ? toNumber(v.commission_rate) : null;
  if (v.commission_rate.trim() && (rate == null || rate < 0 || rate > 100)) {
    e.commission_rate = "The commission rate must be between 0 and 100.";
  }
  if (v.commission_amount.trim()) {
    const amount = toNumber(v.commission_amount);
    if (amount == null || amount < 0)
      e.commission_amount = "Enter the commission as a positive amount.";
  }
  return e;
}
