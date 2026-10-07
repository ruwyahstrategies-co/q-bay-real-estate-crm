// Preferred Language is a fixed list in the CRM. The DB column stays plain text
// so older leads that hold a different value are never rewritten or erased.

export const PREFERRED_LANGUAGES = ["Arabic", "English", "French"] as const;

export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

/**
 * Maps a casing/whitespace variant of one of the three allowed languages to its
 * canonical spelling ("arabic" -> "Arabic"). Anything else is returned trimmed
 * but otherwise untouched, so unrelated values are not over-normalised.
 * Returns "" for empty input.
 */
export function normalizePreferredLanguage(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const match = PREFERRED_LANGUAGES.find((l) => l.toLowerCase() === text.toLowerCase());
  return match ?? text;
}

/**
 * Dropdown options for the Lead form: the three languages, plus the lead's
 * current value when it is an old free-text entry, flagged so it is visible
 * while editing and can be switched to a supported language.
 */
export function preferredLanguageOptions(
  current: string | null | undefined,
): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = PREFERRED_LANGUAGES.map((l) => ({
    value: l,
    label: l,
  }));
  const value = (current ?? "").trim();
  if (value && !PREFERRED_LANGUAGES.some((l) => l === value)) {
    opts.unshift({ value, label: `${value} (legacy value)` });
  }
  return opts;
}
