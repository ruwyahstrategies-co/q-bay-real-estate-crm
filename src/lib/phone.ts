/** Trims and collapses internal whitespace. Never invents or reformats digits. */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Returns an error message, or null when the phone is acceptable. Requires a value with
 * at least 7 digits and only characters people type into phone fields.
 */
export function phoneError(value: string | null | undefined): string | null {
  const v = normalizePhone(value);
  if (!v) return "Phone number is required";
  if (!/^[+\d(][\d\s\-().]*$/.test(v)) return "Phone number can only contain digits, spaces, + - ( )";
  if (v.replace(/\D/g, "").length < 7) return "Phone number looks too short";
  return null;
}

/**
 * Canonical digits used only to decide whether two phone numbers are the same person's number,
 * never stored or shown. "+974 5555 1234", "0097455551234", "97455551234" and "55551234" all
 * give the same key, so a spreadsheet written differently from the CRM still matches. Numbers
 * from other countries are compared by their full digits.
 */
export function phoneMatchKey(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("974") && digits.length === 11) digits = digits.slice(3);
  return digits;
}

/**
 * Cleans a phone value that came out of a spreadsheet cell. Excel likes to turn phone numbers
 * into numbers: "97455551234.0", "97,455,551,234", a leading apostrophe, or scientific
 * notation. Fixes what can be fixed exactly and reports what cannot, without guessing digits.
 */
export function cleanSpreadsheetPhone(raw: unknown): { value: string; problem: string | null } {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s.startsWith("'")) s = s.slice(1).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  if (/^[+-]?\d(\.\d+)?e[+-]?\d+$/i.test(s)) {
    return {
      value: s,
      problem:
        "phone number is in scientific notation (Excel shortened it). Format the phone column as Text and try again",
    };
  }
  return { value: s, problem: null };
}
