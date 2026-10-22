// How a money figure is shown on a dashboard tile: short enough to sit on one line in a narrow card, with the
// exact amount kept for the tooltip and for screen readers.

export type MetricMoney = {
  /** What the tile shows, for example "QAR 101.7M" or "QAR 925,000". */
  value: string;
  /** The exact amount, for the tooltip and assistive technology. Same as value when nothing was shortened. */
  exact: string;
  /** True when value is a shortened form of exact. */
  shortened: boolean;
};

/** The value and tooltip props for a MetricCard showing money: spread them onto the card. */
export function moneyProps(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { value: string; title: string | undefined } {
  const m = metricMoney(amount, currency);
  return { value: m.value, title: m.shortened ? m.exact : undefined };
}

/** Amounts from one million up are shortened (1.2M, 101.7M, 1.5B); smaller ones are shown in full. */
export const COMPACT_FROM = 1_000_000;

function exactMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace(/ /g, " ");
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}

/** A money figure for a tile. Null or a missing amount becomes a dash so a tile never says "QAR NaN". */
export function metricMoney(amount: number | null | undefined, currency: string | null | undefined): MetricMoney {
  const cur = (currency || "QAR").toUpperCase();
  if (amount == null || !Number.isFinite(amount)) return { value: "-", exact: "-", shortened: false };
  const exact = exactMoney(amount, cur);
  if (Math.abs(amount) < COMPACT_FROM) return { value: exact, exact, shortened: false };
  let short: string;
  try {
    short = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      currencyDisplay: "code",
      notation: "compact",
      maximumFractionDigits: 1,
    })
      .format(amount)
      .replace(/ /g, " ");
  } catch {
    short = `${cur} ${(amount / 1_000_000).toFixed(1)}M`;
  }
  return { value: short, exact, shortened: short !== exact };
}
