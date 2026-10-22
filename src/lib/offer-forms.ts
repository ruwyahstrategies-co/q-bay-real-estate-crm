// Booking Form and Reservation Form: the values on a form, filling them from CRM records, and checking them.
//
// The two supplied PDFs in /public are the real templates; offer-forms-pdf.ts writes these values into
// them. This file holds no PDF code, so the lead and offers pages can use it without loading the PDF library.

export type OfferFormType = "booking" | "reservation";

export const OFFER_FORM_LABELS: Record<OfferFormType, string> = {
  booking: "Booking Form",
  reservation: "Reservation Form",
};

/** Paths of the original templates in /public. The names contain a space, so they are encoded on fetch. */
export const OFFER_FORM_TEMPLATES: Record<OfferFormType, string> = {
  booking: "/Booking Form Sale.pdf",
  reservation: "/Reservation Form.pdf",
};

/** Everything staff can see and edit before generating. All values are the text that gets printed. */
export type OfferFormValues = {
  /** ISO date (yyyy-mm-dd), printed as dd/mm/yyyy on the Date line. */
  form_date: string;
  client_name: string;
  client_mobile: string;
  client_email: string;
  client_id_number: string;
  location: string;
  tower_name: string;
  floor: string;
  unit_no: string;
  bedrooms: string;
  size: string;
  price: string;
  /** Booking Form only: the office commission rate, printed in the "will be ....%" gap. */
  commission_percent: string;
  /** Reservation Form only: the reserved amount, printed in both the Arabic and English sentence. */
  reservation_amount: string;
};

export const EMPTY_OFFER_FORM_VALUES: OfferFormValues = {
  form_date: "",
  client_name: "",
  client_mobile: "",
  client_email: "",
  client_id_number: "",
  location: "",
  tower_name: "",
  floor: "",
  unit_no: "",
  bedrooms: "",
  size: "",
  price: "",
  commission_percent: "",
  reservation_amount: "",
};

// ---------------------------------------------------------------------------------------------
// Prefill from CRM records
// ---------------------------------------------------------------------------------------------

type PrefillInput = {
  offer: { amount?: number | null; currency?: string | null; offer_date?: string | null };
  lead: { full_name?: string | null; phone?: string | null; email?: string | null } | null;
  property: {
    location?: string | null;
    tower_name?: string | null;
    floor_number?: string | null;
    unit_number?: string | null;
    bedrooms?: number | null;
    size?: number | null;
    size_unit?: string | null;
    built_up_area?: number | null;
    built_up_area_unit?: string | null;
    price?: number | null;
    currency?: string | null;
  } | null;
  development: { name?: string | null } | null;
  areaName?: string | null;
  placeName?: string | null;
  /** Today's date as yyyy-mm-dd. Passed in so the function stays pure and testable. */
  today: string;
};

function unitLabel(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u || u === "sqm" || u === "sq_m" || u === "m2") return "sqm";
  if (u === "sqft" || u === "sq_ft" || u === "ft2") return "sqft";
  return u;
}

export function formatMoneyText(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "";
  return `${currency || "QAR"} ${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Builds the starting values for a form from the offer, its lead, property and development.
 * Anything the CRM does not hold (ID number, commission, reservation amount) stays empty for
 * staff to complete.
 */
export function prefillOfferForm(input: PrefillInput): OfferFormValues {
  const { offer, lead, property, development, areaName, placeName, today } = input;

  const area = (areaName ?? "").trim();
  const place = (placeName ?? "").trim();
  const location = (property?.location ?? "").trim() || [place, area].filter(Boolean).join(", ");

  const unitSize = property?.built_up_area ?? property?.size ?? null;
  const unitSizeUnit =
    property?.built_up_area != null ? property?.built_up_area_unit : property?.size_unit;
  const size =
    unitSize != null && Number(unitSize) > 0
      ? `${Number(unitSize)} ${unitLabel(unitSizeUnit)}`
      : "";

  const priceAmount = offer.amount ?? property?.price ?? null;
  const priceCurrency =
    offer.amount != null ? offer.currency : (property?.currency ?? offer.currency);

  return {
    form_date: today,
    client_name: (lead?.full_name ?? "").trim(),
    client_mobile: (lead?.phone ?? "").trim(),
    client_email: (lead?.email ?? "").trim(),
    client_id_number: "",
    location,
    tower_name: (property?.tower_name ?? "").trim() || (development?.name ?? "").trim(),
    floor: (property?.floor_number ?? "").toString().trim(),
    unit_no: (property?.unit_number ?? "").toString().trim(),
    bedrooms:
      property?.bedrooms == null
        ? ""
        : property.bedrooms === 0
          ? "Studio"
          : String(property.bedrooms),
    size,
    price: formatMoneyText(priceAmount, priceCurrency),
    commission_percent: "",
    reservation_amount: "",
  };
}

/** Turns a bare number into "QAR 1,250,000"; text staff typed themselves is kept as typed. */
export function normalizeMoneyText(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^[\d,.\s]+$/.test(t)) {
    const n = Number(t.replace(/[,\s]/g, ""));
    if (Number.isFinite(n)) return formatMoneyText(n, "QAR");
  }
  return t;
}

/** The values as they will be printed: money shown as "QAR 1,250,000", the commission as a bare number. */
export function finalizeOfferFormValues(v: OfferFormValues): OfferFormValues {
  return {
    ...v,
    price: normalizeMoneyText(v.price),
    reservation_amount: normalizeMoneyText(v.reservation_amount),
    commission_percent: v.commission_percent.replace(/%/g, "").trim(),
  };
}

export type OfferFormIssue = { field: keyof OfferFormValues; message: string };

/** Problems that would print a wrong or unreadable form. Missing optional values are not issues. */
export function validateOfferForm(type: OfferFormType, v: OfferFormValues): OfferFormIssue[] {
  const issues: OfferFormIssue[] = [];
  if (!v.client_name.trim())
    issues.push({ field: "client_name", message: "Client name is required" });
  if (v.form_date && Number.isNaN(Date.parse(v.form_date))) {
    issues.push({ field: "form_date", message: "Date is not valid" });
  }
  if (type === "booking" && v.commission_percent.trim()) {
    const n = Number(v.commission_percent.replace(/%/g, "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      issues.push({
        field: "commission_percent",
        message: "Commission must be a number from 0 to 100",
      });
    }
  }
  return issues;
}

export function formatFormDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim();
}

/** File name for the generated PDF, safe on every operating system. */
export function offerFormFilename(type: OfferFormType, values: OfferFormValues): string {
  const part = (s: string) =>
    s
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const bits = [
    OFFER_FORM_LABELS[type],
    part(values.client_name),
    part(values.unit_no ? `Unit ${values.unit_no}` : ""),
  ];
  const date = /^\d{4}-\d{2}-\d{2}/.test(values.form_date) ? values.form_date.slice(0, 10) : "";
  return `${bits.filter(Boolean).join(" - ")}${date ? ` - ${date}` : ""}.pdf`;
}
