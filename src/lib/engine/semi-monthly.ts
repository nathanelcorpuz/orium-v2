import type { RecurringItem } from "./types";
import { daysInMonth, formatDate } from "./date-utils";

function secondSemiMonthlyDay(year: number, month: number): number {
  // February has no 30th, so use its actual last day (28 or 29) instead.
  return month === 2 ? daysInMonth(year, month) : 30;
}

/**
 * Expands a semi_monthly_15_30 recurring item into occurrence dates within
 * [windowStart, windowEnd], clamped by the item's own start/end dates.
 * Occurrences fall on the 15th and 30th of each month, except February
 * where the second occurrence is the last day of the month.
 */
export function expandSemiMonthlyOccurrences(
  item: Pick<RecurringItem, "startDate" | "endDate">,
  windowStart: string,
  windowEnd: string,
): string[] {
  const effectiveStart = item.startDate > windowStart ? item.startDate : windowStart;
  const effectiveEnd = item.endDate < windowEnd ? item.endDate : windowEnd;
  if (effectiveStart > effectiveEnd) return [];

  const [startYear, startMonth] = effectiveStart.split("-").map(Number);
  const [endYear, endMonth] = effectiveEnd.split("-").map(Number);

  const dates: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const candidates = [formatDate(year, month, 15), formatDate(year, month, secondSemiMonthlyDay(year, month))];
    for (const date of candidates) {
      if (date >= effectiveStart && date <= effectiveEnd) {
        dates.push(date);
      }
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dates;
}
