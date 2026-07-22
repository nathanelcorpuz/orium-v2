import type { RecurrenceRule } from "./engine/types";
import { MONTH_ABBR, formatMonthYear } from "./date";

// Display formatting for a recurrence rule (e.g. "Every 2 weeks on Sat ·
// until Apr 2030"), shown on each Bills/Income/Debt/Savings row (SPEC.md
// T35). Lives alongside money.ts/date.ts rather than in engine/ since it's
// UI display formatting, not occurrence computation.

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINAL_WORDS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth" };

export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatDayList(days: number[]): string {
  const withSuffix = [...days].sort((a, b) => a - b).map((d) => `${d}${ordinalSuffix(d)}`);
  if (withSuffix.length === 1) return withSuffix[0];
  if (withSuffix.length === 2) return `${withSuffix[0]} and ${withSuffix[1]}`;
  return `${withSuffix.slice(0, -1).join(", ")}, and ${withSuffix[withSuffix.length - 1]}`;
}

function formatWeekdayList(weekdays: number[]): string {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((w) => WEEKDAY_ABBR[w])
    .join(", ");
}

function endsSuffix(rule: RecurrenceRule): string {
  switch (rule.endsType) {
    case "never":
      return "";
    case "on_date":
      return rule.endDate ? ` · until ${formatMonthYear(rule.endDate)}` : "";
    case "after_count":
      return rule.occurrenceCount
        ? ` · ${rule.occurrenceCount} time${rule.occurrenceCount === 1 ? "" : "s"}`
        : "";
  }
}

export function summarizeRecurrence(rule: RecurrenceRule): string {
  const suffix = endsSuffix(rule);

  switch (rule.unit) {
    case "day":
      return rule.interval === 1 ? `Every day${suffix}` : `Every ${rule.interval} days${suffix}`;

    case "week": {
      const days = rule.weekdays?.length ? formatWeekdayList(rule.weekdays) : "?";
      return rule.interval === 1
        ? `Weekly on ${days}${suffix}`
        : `Every ${rule.interval} weeks on ${days}${suffix}`;
    }

    case "month": {
      if (rule.daysOfMonth?.length) {
        const days = formatDayList(rule.daysOfMonth);
        return rule.interval === 1
          ? `Monthly on the ${days}${suffix}`
          : `Every ${rule.interval} months on the ${days}${suffix}`;
      }
      if (rule.ordinal !== null && rule.ordinalWeekday !== null) {
        const ordinalWord = rule.ordinal === -1 ? "last" : (ORDINAL_WORDS[rule.ordinal] ?? `${rule.ordinal}th`);
        const weekday = WEEKDAY_ABBR[rule.ordinalWeekday];
        return rule.interval === 1
          ? `Monthly on the ${ordinalWord} ${weekday}${suffix}`
          : `Every ${rule.interval} months on the ${ordinalWord} ${weekday}${suffix}`;
      }
      // Shouldn't happen with valid data (unit=month always has one or the other).
      return `Monthly${suffix}`;
    }

    case "year": {
      const [, month, day] = rule.startDate.split("-").map(Number);
      const monthDay = `${MONTH_ABBR[month - 1]} ${day}`;
      return rule.interval === 1
        ? `Yearly on ${monthDay}${suffix}`
        : `Every ${rule.interval} years on ${monthDay}${suffix}`;
    }
  }
}
