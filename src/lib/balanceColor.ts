// preferences.balance_ranges is 5 ascending centavos thresholds: [danger, low, medium, high, higher].
// balance <= ranges[0] is danger; above ranges[4] is highest.
export type BalanceRangeTier = "danger" | "low" | "medium" | "high" | "higher" | "highest";

export function balanceRangeTier(balance: number, ranges: number[]): BalanceRangeTier {
  const [danger, low, medium, high, higher] = ranges;
  if (balance <= danger) return "danger";
  if (balance <= low) return "low";
  if (balance <= medium) return "medium";
  if (balance <= high) return "high";
  if (balance <= higher) return "higher";
  return "highest";
}

const TIER_COLOR_CLASS: Record<BalanceRangeTier, string> = {
  danger: "bg-slate-900 text-white",
  low: "bg-red-100",
  medium: "bg-white",
  high: "bg-green-100",
  higher: "bg-green-300",
  // User request 2026-07-25: bg-green-500 read as low-contrast against the
  // default dark text every other non-danger tier inherits - white text
  // fixes it without dulling the color, matching the danger tier's own
  // text-white treatment.
  highest: "bg-green-500 text-white",
};

export function balanceRangeColorClass(balance: number, ranges: number[]): string {
  return TIER_COLOR_CLASS[balanceRangeTier(balance, ranges)];
}

// T76 (SPEC.md): distinct wording per risk tier for the "lowest balance
// ahead" stat (Dashboard card + Forecast header line), replacing the old
// hardcoded balance<=0 binary. Danger keeps the established "Goes negative
// by" phrasing (SPEC.md T46) since that's the one tier where the amount
// shown is a deficit, not a low-but-positive balance - every other tier's
// phrase is followed by the (positive) amount directly.
//
// T80: these are now user-editable from Settings (preferences.balance_tier_
// labels, migration 0014), stored as a plain 6-entry array in this same
// tier order rather than a Record, so the DB column and the UI form can
// both just work with a flat list. DEFAULT_TIER_LABELS is both the
// migration's DB default and the fallback here for any caller that hasn't
// fetched a user's custom labels yet.
export const TIER_ORDER: BalanceRangeTier[] = ["danger", "low", "medium", "high", "higher", "highest"];

export const DEFAULT_TIER_LABELS: string[] = [
  "⚠ Goes negative by",
  "Cutting it close:",
  "Lowest balance ahead:",
  "Comfortable low point:",
  "Healthy low point:",
  "Strong low point:",
];

export function lowestBalanceLabel(balance: number, ranges: number[], customLabels?: string[]): string {
  const tier = balanceRangeTier(balance, ranges);
  const index = TIER_ORDER.indexOf(tier);
  const labels = customLabels && customLabels.length === TIER_ORDER.length ? customLabels : DEFAULT_TIER_LABELS;
  return labels[index];
}
