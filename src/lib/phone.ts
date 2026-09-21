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
  if (!/^[+\d][\d\s\-().]*$/.test(v)) return "Phone number can only contain digits, spaces, + - ( )";
  if (v.replace(/\D/g, "").length < 7) return "Phone number looks too short";
  return null;
}
