import type { RecurringItem } from "./types";
import { addDays, daysBetween } from "./date-utils";

/**
 * Expands a fixed-interval recurring item (every `intervalDays` days,
 * anchored on the item's start_date) into occurrence dates within
 * [windowStart, windowEnd], clamped by the item's own start/end dates.
 */
function expandIntervalOccurrences(
  item: Pick<RecurringItem, "startDate" | "endDate">,
  intervalDays: number,
  windowStart: string,
  windowEnd: string,
): string[] {
  const effectiveEnd = item.endDate < windowEnd ? item.endDate : windowEnd;
  if (item.startDate > effectiveEnd) return [];

  let firstOccurrence = item.startDate;
  if (windowStart > item.startDate) {
    const diff = daysBetween(item.startDate, windowStart);
    const steps = Math.ceil(diff / intervalDays);
    firstOccurrence = addDays(item.startDate, steps * intervalDays);
  }
  if (firstOccurrence > effectiveEnd) return [];

  const dates: string[] = [];
  let current = firstOccurrence;
  while (current <= effectiveEnd) {
    dates.push(current);
    current = addDays(current, intervalDays);
  }

  return dates;
}

export function expandWeeklyOccurrences(
  item: Pick<RecurringItem, "startDate" | "endDate">,
  windowStart: string,
  windowEnd: string,
): string[] {
  return expandIntervalOccurrences(item, 7, windowStart, windowEnd);
}

export function expandBiweeklyOccurrences(
  item: Pick<RecurringItem, "startDate" | "endDate">,
  windowStart: string,
  windowEnd: string,
): string[] {
  return expandIntervalOccurrences(item, 14, windowStart, windowEnd);
}
