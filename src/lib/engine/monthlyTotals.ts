import type { RecurringFrequency } from "./types";

const MONTHLY_MULTIPLIER: Record<RecurringFrequency, number> = {
  monthly: 1,
  weekly: 4,
  biweekly: 2,
  semi_monthly_15_30: 2,
};

// Summary-stat estimate for "Total Monthly X" cards: fixed integer multipliers
// per SPEC.md T22, never 52/12-style fractional math. The forecast itself keeps
// using real occurrence dates (a 5-Saturday month genuinely shows 5 incomes) —
// only these summary totals use multipliers.
export function monthlyEquivalent(item: { amount: number; frequency: RecurringFrequency }): number {
  return item.amount * MONTHLY_MULTIPLIER[item.frequency];
}
