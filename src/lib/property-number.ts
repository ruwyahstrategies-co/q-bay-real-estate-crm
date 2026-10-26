// The property number: a permanent, sequential handle (001, 002, 003 ...) that is independent of the owner and
// of the assigned agent. The owner and agent based reference code is kept as the historical reference.

type NumberFields = {
  property_number?: number | null;
  property_number_label?: string | null;
  reference_code?: string | null;
};

/** 1 -> "001", 42 -> "042", 1000 -> "1000". Empty for a missing or invalid number. */
export function formatPropertyNumber(n: number | null | undefined): string {
  if (n == null || !Number.isInteger(n) || n < 1) return "";
  return String(n).padStart(3, "0");
}

/** The number as staff read it. Falls back to the stored label, then to nothing. */
export function propertyNumberOf(p: NumberFields | null | undefined): string {
  if (!p) return "";
  return formatPropertyNumber(p.property_number) || p.property_number_label || "";
}

/**
 * The short code that leads a property in lists, pickers and sentences: the number, or the historical
 * reference when a property has no number yet. Empty when neither exists.
 */
export function propertyCode(p: NumberFields | null | undefined): string {
  return propertyNumberOf(p) || p?.reference_code || "";
}

/** "001 · " ready to put in front of a title, or nothing when there is no code. */
export function propertyCodePrefix(p: NumberFields | null | undefined): string {
  const code = propertyCode(p);
  return code ? `${code} · ` : "";
}

/** "001 · Title", or just the title when there is no code. */
export function propertyLabel(p: (NumberFields & { title?: string | null }) | null | undefined): string {
  const code = propertyCode(p);
  const title = p?.title ?? "";
  return [code, title].filter(Boolean).join(" · ");
}

/** A typed number such as "7", "007" or "#007" as the integer it names, or null. */
export function parsePropertyNumber(input: string | null | undefined): number | null {
  const m = /^\s*#?\s*0*(\d{1,9})\s*$/.exec(input ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}
