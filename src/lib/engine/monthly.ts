import { clampDayOfMonth, formatDate } from "./date-utils";

function clampedMonthlyDate(year: number, month: number, dayOfMonth: number): string {
  return formatDate(year, month, clampDayOfMonth(year, month, dayOfMonth));
}

/**
 * Expands a monthly recurring item into occurrence dates within [windowStart, windowEnd],
 * clamped by the item's own start/end dates. Days that overflow the month's length
 * (e.g. day 31 in April, day 29-31 in February) clamp to that month's last day.
 *
 * Legacy path (SPEC.md's old 4-frequency model) for items without the new
 * recurrence columns set; superseded by expandRecurrenceOccurrences in
 * recurrence.ts once an item has migrated. Decoupled from RecurringItem's
 * (now-nullable) endDate since this legacy path only ever runs for items
 * that still have a non-null end_date.
 */
export function expandMonthlyOccurrences(
  item: { startDate: string; endDate: string; dayOfMonth: number | null },
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
