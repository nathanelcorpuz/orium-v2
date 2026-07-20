import type { RecurringItem } from "./types";

function daysInMonth(year: number, month: number): number {
  // Date.UTC's day-0 trick returns the last day of the *previous* month,
  // so passing `month` (1-indexed) gives the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampedMonthlyDate(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Expands a monthly recurring item into occurrence dates within [windowStart, windowEnd],
 * clamped by the item's own start/end dates. Days that overflow the month's length
 * (e.g. day 31 in April, day 29-31 in February) clamp to that month's last day.
 */
export function expandMonthlyOccurrences(
  item: Pick<RecurringItem, "startDate" | "endDate" | "dayOfMonth">,
  windowStart: string,
  windowEnd: string,
): string[] {
  if (item.dayOfMonth === null) return [];

  const effectiveStart = item.startDate > windowStart ? item.startDate : windowStart;
  const effectiveEnd = item.endDate < windowEnd ? item.endDate : windowEnd;
  if (effectiveStart > effectiveEnd) return [];

  const [startYear, startMonth] = effectiveStart.split("-").map(Number);
  const [endYear, endMonth] = effectiveEnd.split("-").map(Number);

  const dates: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const date = clampedMonthlyDate(year, month, item.dayOfMonth);
    if (date >= effectiveStart && date <= effectiveEnd) {
      dates.push(date);
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dates;
}
