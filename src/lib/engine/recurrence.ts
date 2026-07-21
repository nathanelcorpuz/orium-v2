import type { RecurrenceRule } from "./types";
import { addDays, clampDayOfMonth, daysInMonth, formatDate } from "./date-utils";

// Defensive upper bound on periods scanned (weeks/months/years/day-steps).
// Never expected to bind for realistic schedules: even a daily item over a
// century is ~36,500 periods... this caps far short of that on purpose, as
// a backstop against a runaway loop from a future bug, not a real limit.
const MAX_PERIODS = 10000;

function dowOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
}

function weekStartOf(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return addDays(dateStr, -dowOf(year, month, day));
}

function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const total = month - 1 + months;
  return { year: year + Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

// Resolves an nth-weekday rule ("3rd Tuesday", "last Friday") to a date
// within the given month. ordinal is 1-4 (1st..4th) or -1 (last);
// ordinalWeekday is 0-6 (Sun-Sat). Every weekday occurs at least 4 times in
// any month, so ordinal 1-4 always resolves within the month - no clamping
// or "5th occurrence doesn't exist" case to handle.
function resolveOrdinalWeekday(year: number, month: number, ordinal: number, ordinalWeekday: number): string {
  if (ordinal === -1) {
    const lastDay = daysInMonth(year, month);
    const offsetFromEnd = (dowOf(year, month, lastDay) - ordinalWeekday + 7) % 7;
    return formatDate(year, month, lastDay - offsetFromEnd);
  }

  const offsetFromStart = (ordinalWeekday - dowOf(year, month, 1) + 7) % 7;
  return formatDate(year, month, 1 + offsetFromStart + (ordinal - 1) * 7);
}

// One period's candidate dates, sorted ascending. periodIndex 0 is the
// day/week/month/year containing start_date; every `interval`-th period
// after that is the next one emitted.
function periodCandidates(rule: RecurrenceRule, periodIndex: number): string[] {
  switch (rule.unit) {
    case "day":
      return [addDays(rule.startDate, periodIndex * rule.interval)];

    case "week": {
      const periodWeekStart = addDays(weekStartOf(rule.startDate), periodIndex * rule.interval * 7);
      const weekdays = [...(rule.weekdays ?? [])].sort((a, b) => a - b);
      return weekdays.map((weekday) => addDays(periodWeekStart, weekday));
    }

    case "month": {
      const [startYear, startMonth] = rule.startDate.split("-").map(Number);
      const { year, month } = addMonths(startYear, startMonth, periodIndex * rule.interval);

      const days = [...(rule.daysOfMonth ?? [])].sort((a, b) => a - b);
      if (days.length > 0) {
        return days.map((day) => formatDate(year, month, clampDayOfMonth(year, month, day)));
      }

      // unit=month uses either daysOfMonth or the ordinal pair, never both
      // (DB-enforced) - daysOfMonth being empty means this is an
      // nth-weekday rule instead.
      if (rule.ordinal !== null && rule.ordinalWeekday !== null) {
        return [resolveOrdinalWeekday(year, month, rule.ordinal, rule.ordinalWeekday)];
      }

      return [];
    }

    case "year": {
      const [startYear, startMonth, startDay] = rule.startDate.split("-").map(Number);
      const year = startYear + periodIndex * rule.interval;
      return [formatDate(year, startMonth, clampDayOfMonth(year, startMonth, startDay))];
    }
  }
}

/**
 * Expands a recurrence rule (SPEC.md Phase 6A: interval + unit + weekdays /
 * days_of_month + an ends rule) into occurrence dates within
 * [windowStart, windowEnd].
 *
 * Occurrences are generated in chronological order starting from
 * start_date (not windowStart) so that "after_count" counts correctly even
 * when the window starts partway through a rule's life; occurrences before
 * windowStart are still counted toward that total but excluded from the
 * returned list, matching the rest of the engine's "occurrences strictly
 * before today are excluded" convention.
 */
export function expandRecurrenceOccurrences(
  rule: RecurrenceRule,
  windowStart: string,
  windowEnd: string,
): string[] {
  const dates: string[] = [];
  let emittedCount = 0;

  for (let periodIndex = 0; periodIndex < MAX_PERIODS; periodIndex++) {
    const candidates = periodCandidates(rule, periodIndex);
    if (candidates.length === 0) return dates;

    for (const date of candidates) {
      if (date < rule.startDate) continue;

      if (rule.endsType === "after_count" && emittedCount >= (rule.occurrenceCount ?? 0)) {
        return dates;
      }
      if (rule.endsType === "on_date" && rule.endDate !== null && date > rule.endDate) {
        return dates;
      }
      if (date > windowEnd) {
        return dates;
      }

      emittedCount += 1;
      if (date >= windowStart) {
        dates.push(date);
      }
    }
  }

  return dates;
}
