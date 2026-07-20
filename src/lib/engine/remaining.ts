import type { RecurringItem } from "./types";
import { expandMonthlyOccurrences } from "./monthly";

// Sum of a monthly recurring item's remaining occurrence amounts, from
// `today` through the item's own end_date (e.g. total left to pay off a
// debt, or total left to contribute toward a savings goal).
export function remainingMonthlyTotal(
  item: Pick<RecurringItem, "startDate" | "endDate" | "dayOfMonth" | "amount">,
  today: string,
): number {
  const occurrences = expandMonthlyOccurrences(item, today, item.endDate);
  return occurrences.length * Math.abs(item.amount);
}
