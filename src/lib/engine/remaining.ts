import { expandMonthlyOccurrences } from "./monthly";

// Sum of a monthly recurring item's remaining occurrence amounts, from
// `today` through the item's own end_date (e.g. total left to pay off a
// debt, or total left to contribute toward a savings goal).
//
// Legacy path (SPEC.md's old 4-frequency model), used only for items with
// a fixed end_date. Decoupled from RecurringItem's (now-nullable) endDate:
// callers filter to non-null end_date items before calling this (see
// page.tsx's debtItems filter) since an item with no end date has no
// "remaining total" in this sense.
export function remainingMonthlyTotal(
  item: { startDate: string; endDate: string; dayOfMonth: number | null; amount: number },
  today: string,
): number {
  const occurrences = expandMonthlyOccurrences(item, today, item.endDate);
  return occurrences.length * Math.abs(item.amount);
}
