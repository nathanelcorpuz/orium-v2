import type { Budget, RecurrenceRule, RecurringItem } from "./engine/types";
import { ruleEndDate } from "./engine/remaining";
import { MONTH_ABBR, formatFullDate, formatMonthYear } from "./date";

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
    case "after_count": {
      if (!rule.occurrenceCount) return "";
      const countText = `${rule.occurrenceCount} time${rule.occurrenceCount === 1 ? "" : "s"}`;
      // REMINDER.md, 2026-08-03: "a quick way to find out the end date even
      // if the ends selection is after n times" - `ruleEndDate` (already
      // used for the debt-free/savings-goal dates) resolves the Nth
      // occurrence directly, so this needs no new computation, just
      // surfacing it here too.
      const endDate = ruleEndDate(rule);
      return endDate ? ` · ${countText} · until ${formatMonthYear(endDate)}` : ` · ${countText}`;
    }
  }
}

// T156 (SPEC.md Phase 20): "Started {date}" for a row's meta line, shown
// alongside `summarizeRecurrence` on Bills/Income/Debt/Savings rows. A
// separate function rather than folded into `summarizeRecurrence` itself,
// since that function is also used for Budgets' compact pill/frequency
// labels (BudgetCard.tsx), which weren't part of this request and have no
// room for a second clause.
export function startDateLabel(rule: RecurrenceRule): string {
  return `Started ${formatFullDate(rule.startDate)}`;
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

// T199 (user request): a budget_replenish row's own "frequency" - an
// income-linked budget borrows its linked income's rule (that's what
// actually drives when it replenishes); an own-schedule budget already
// carries the full rule shape itself. Returns null for a manual budget
// (neither) - nothing to summarize. Lives here rather than budgetLedger.ts
// since it's display formatting, same reasoning summarizeRecurrence itself
// already documents at the top of this file.
export function budgetReplenishRuleSummary(
  budget: Pick<
    Budget,
    | "linkedIncomeId"
    | "startDate"
    | "interval"
    | "unit"
    | "weekdays"
    | "daysOfMonth"
    | "ordinal"
    | "ordinalWeekday"
    | "endsType"
    | "endDate"
    | "occurrenceCount"
  >,
  recurringItemsById: Map<string, RecurringItem>,
): string | null {
  if (budget.linkedIncomeId) {
    const income = recurringItemsById.get(budget.linkedIncomeId);
    return income ? summarizeRecurrence(income) : null;
  }
  if (budget.startDate && budget.interval !== null && budget.unit !== null && budget.endsType !== null) {
    return summarizeRecurrence({
      startDate: budget.startDate,
      interval: budget.interval,
      unit: budget.unit,
      weekdays: budget.weekdays,
      daysOfMonth: budget.daysOfMonth,
      ordinal: budget.ordinal,
      ordinalWeekday: budget.ordinalWeekday,
      endsType: budget.endsType,
      endDate: budget.endDate,
      occurrenceCount: budget.occurrenceCount,
    });
  }
  return null;
}
