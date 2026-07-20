// preferences.balance_ranges is 5 ascending centavos thresholds: [danger, low, medium, high, higher].
// balance <= ranges[0] is danger; above ranges[4] is highest.
export function balanceRangeColorClass(balance: number, ranges: number[]): string {
  const [danger, low, medium, high, higher] = ranges;
  if (balance <= danger) return "bg-slate-900 text-white";
  if (balance <= low) return "bg-red-100";
  if (balance <= medium) return "bg-white";
  if (balance <= high) return "bg-green-100";
  if (balance <= higher) return "bg-green-300";
  return "bg-green-500";
}
