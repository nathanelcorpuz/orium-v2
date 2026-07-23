import type { Budget, BudgetEntry, RecurrenceRule } from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";
import { addDays, daysBetween } from "./date-utils";

// Budgets v3 (SPEC.md Phase 10): a budget is a simple running ledger, not a
// cycle that resets on a schedule. Every budget_entries row is either money
// IN ("incoming" - a replenishment, from a settled linked income or a
// manual add) or money OUT ("outgoing" - a logged spend or a manual take).
// A budget's current total is just sum(incoming) - sum(outgoing) for
// entries dated today or earlier - carryover is implicit (there's no cycle
// to reset), and overspending is allowed to go negative, same as a real
// account. As of T57 this is the only budget engine module - the old
// cycle/allocation/carryover model (budgetCycles.ts) has been deleted.

function signedAmount(entry: BudgetEntry): number {
  return entry.direction === "incoming" ? entry.amount : -entry.amount;
}

/**
 * A budget's current available total: every entry dated `asOf` or earlier,
 * incoming minus outgoing. Future-dated entries (whether incoming or
 * outgoing) haven't happened yet, so they don't count here - they show up
 * as their own Forecast rows instead (see futureBudgetLedgerEntries). Can
 * go negative (overspend) - no clamping, unlike the old cycle model.
 */
export function computeBudgetBalance(entries: BudgetEntry[], budgetId: string, asOf: string): number {
  return entries
    .filter((e) => e.budgetId === budgetId && e.entryDate <= asOf)
    .reduce((sum, e) => sum + signedAmount(e), 0);
}

/**
 * This budget's entries dated after `today`, sorted ascending - each
 * renders as its own Forecast row (forecast.ts) rather than affecting the
 * current total, the same pattern T43 established for future-dated spends,
 * now covering incoming entries too (e.g. a future-dated manual "add
 * funds").
 */
export function futureBudgetLedgerEntries(entries: BudgetEntry[], budgetId: string, today: string): BudgetEntry[] {
  return entries
    .filter((e) => e.budgetId === budgetId && e.entryDate > today)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0));
}

// Phase 11 (SPEC.md T58): a budget now replenishes on a schedule - either
// its own ("replenish every"), or its linked income's (income-linked
// budgets no longer replenish *only* on settle - T59 projects these dates
// forward as real Forecast deduction rows). This section resolves that
// schedule and answers "when's the next replenish" for the progress bar;
// the ledger balance math above is unaffected by any of it.

/**
 * The recurrence rule driving a budget's replenishment: its own schedule
 * when it has one, or its linked income's schedule when it's income-linked
 * (the two are mutually exclusive - DB-enforced by migration 0011). `null`
 * for a manual budget, or an income-linked budget whose linked income
 * wasn't passed in (e.g. it was deleted - `linked_income_id` sets itself to
 * null via ON DELETE SET NULL, so this shouldn't outlive a page refresh).
 *
 * `linkedIncome` takes anything with a RecurrenceRule's fields (a full
 * `RecurringItem` satisfies this structurally, so callers who already have
 * one - e.g. the Dashboard/Budgets page looking up a budget's linked income
 * from `recurringItems` - can pass it straight through with no conversion).
 */
export function budgetReplenishRule(budget: Budget, linkedIncome: RecurrenceRule | null): RecurrenceRule | null {
  if (budget.linkedIncomeId !== null) {
    return linkedIncome;
  }

  if (budget.startDate === null || budget.interval === null || budget.unit === null || budget.endsType === null) {
    return null;
  }

  return {
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
  };
}

/**
 * This budget's replenish occurrence dates from `asOf` through `horizon` -
 * the dates T59 projects as Forecast deduction rows (minus whichever of
 * them already have a budget_replenish_overrides row marking them settled/
 * skipped - that filtering happens at the forecast.ts merge layer, same as
 * occurrence_overrides for recurring items, not here). Empty for a manual
 * budget (no resolvable rule).
 */
export function futureBudgetReplenishDates(rule: RecurrenceRule | null, asOf: string, horizon: string): string[] {
  if (rule === null) return [];
  return expandRecurrenceOccurrences(rule, asOf, horizon);
}

// Bound for "how far ahead do we search for the next occurrence" - independent
// of any real forecast horizon, since the progress bar needs a next-replenish
// date even for callers (Dashboard, Budgets page) that never load a horizon-
// bounded forecast. Matches the app's typical ~3-year forecast horizon.
const NEXT_OCCURRENCE_SEARCH_DAYS = 365 * 3;

export interface ReplenishProgress {
  previousDate: string | null; // most recent scheduled occurrence at-or-before asOf; null if asOf is before the rule even starts
  nextDate: string | null; // next scheduled occurrence at-or-after asOf; null once an after_count/on_date rule has run out
  daysUntil: number | null; // daysBetween(asOf, nextDate); null when nextDate is null
  fraction: number | null; // 0-1, elapsed share of [previousDate, nextDate]; null when either end is unknown
}

/**
 * "Days until replenish" + the progress bar's elapsed fraction (SPEC.md
 * Phase 11): how far `asOf` sits between the last scheduled occurrence and
 * the next one. A time-based bar, not spend-vs-allocation - there's no
 * cycle/allocation target to measure spend against in the ledger model
 * (Phase 10). `null` throughout for a manual budget (no rule at all).
 */
export function replenishProgress(rule: RecurrenceRule | null, asOf: string): ReplenishProgress {
  if (rule === null) {
    return { previousDate: null, nextDate: null, daysUntil: null, fraction: null };
  }

  const past = expandRecurrenceOccurrences(rule, rule.startDate, asOf);
  const previousDate = past.length > 0 ? past[past.length - 1] : null;

  const upcoming = expandRecurrenceOccurrences(rule, asOf, addDays(asOf, NEXT_OCCURRENCE_SEARCH_DAYS));
  const nextDate = upcoming.length > 0 ? upcoming[0] : null;

  const daysUntil = nextDate !== null ? daysBetween(asOf, nextDate) : null;

  let fraction: number | null = null;
  if (previousDate !== null && nextDate !== null) {
    const periodLength = daysBetween(previousDate, nextDate);
    // previousDate === nextDate happens when asOf itself is a replenish day
    // (it's both "the last one" and "the next one") - a zero-length period
    // reads as "just replenished", i.e. fully elapsed.
    fraction = periodLength > 0 ? Math.min(1, Math.max(0, daysBetween(previousDate, asOf) / periodLength)) : 1;
  }

  return { previousDate, nextDate, daysUntil, fraction };
}
