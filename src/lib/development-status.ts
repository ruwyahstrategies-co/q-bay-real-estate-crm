// Development statuses: what staff can choose, and how an older status is still shown.

/** The statuses a Development can be given. "Under construction" is no longer one of them. */
export const DEVELOPMENT_STATUS_OPTIONS = [
  { value: "off_plan", label: "Off-plan" },
  { value: "ready", label: "Ready" },
] as const;

/** Kept only so a development saved with it earlier still shows its status; it cannot be chosen. */
export const LEGACY_DEVELOPMENT_STATUS = {
  value: "under_construction",
  label: "Under construction",
} as const;

/**
 * The options for a status field. A development that already carries the retired status keeps showing it
 * until someone picks a current one, so opening and saving it never changes the status silently.
 */
export function developmentStatusChoices(current: string | null | undefined) {
  return current === LEGACY_DEVELOPMENT_STATUS.value
    ? [...DEVELOPMENT_STATUS_OPTIONS, LEGACY_DEVELOPMENT_STATUS]
    : [...DEVELOPMENT_STATUS_OPTIONS];
}

export function developmentStatusLabel(status: string | null | undefined): string {
  if (status === LEGACY_DEVELOPMENT_STATUS.value) return LEGACY_DEVELOPMENT_STATUS.label;
  return DEVELOPMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? "-";
}
