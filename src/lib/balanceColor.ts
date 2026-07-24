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
  highest: "bg-green-500",
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
const TIER_LABEL: Record<BalanceRangeTier, string> = {
  danger: "⚠ Goes negative by",
  low: "Cutting it close:",
  medium: "Lowest balance ahead:",
  high: "Comfortable low point:",
  higher: "Healthy low point:",
  highest: "Strong low point:",
};

export function lowestBalanceLabel(balance: number, ranges: number[]): string {
  return TIER_LABEL[balanceRangeTier(balance, ranges)];
}
