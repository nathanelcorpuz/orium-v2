import type { Budget, BudgetEntry, OccurrenceOverride, RecurrenceRule, RecurringItem } from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";
import { addDays } from "./date-utils";

// Budgets v2 (SPEC.md Phase 6B, T37): a budget replenishes at each cycle
// boundary; everything derives from logged spends, no manual resets.
// This is a NEW, separately-named module (not a rewrite of budgets.ts) so
// the currently-deployed Budgets page (BudgetCard.tsx, still on the T24/T25
// monthly-only model) keeps working completely unchanged. Wiring this into
// forecast.ts/forecastData.ts is T39's job, once T38 lets users actually
// configure a linked income or own schedule.

// A moved occurrence's override could shift its effective date to either
// side of `through`; expand this far past `through` before filtering so a
// move either direction is still caught correctly. Generous but bounded -
// real overrides move a single occurrence by days, not years.
const OVERRIDE_LOOKAHEAD_DAYS = 366;

export type BudgetScheduleSource = "linked_income" | "own_schedule" | "fallback";

export interface BudgetCycleStatus {
  source: BudgetScheduleSource;
  currentCycleStart: string;
  allocation: number; // centavos, this cycle's full replenishment
  carriedIn: number; // available - allocation; 0 if no prior cycle, may be negative
  spent: number; // centavos, this cycle's logged spends
  remaining: number; // centavos, >= 0
  over: number; // centavos, >= 0 (> 0 when spent exceeds available)
}

export interface BudgetOccurrence {
  date: string; // YYYY-MM-DD
  amount: number; // centavos, <= 0 (outflow)
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// "Monthly on the 1st", anchored to the budget's own createdAt (not an
// arbitrary distant epoch) - with carryover enabled, an anchor far before
// the budget actually existed would silently accumulate years of phantom
// "unused allocation" that was never really available. Anchoring to
// createdAt means cycle 0 genuinely starts when the budget did.
function fallbackBoundaries(createdAt: string, through: string): string[] {
  const [throughYear, throughMonth] = through.split("-").map(Number);
  const [startYear, startMonth] = createdAt.split("-").map(Number);
  const dates: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < throughYear || (year === throughYear && month <= throughMonth)) {
    dates.push(firstOfMonth(year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

function ownScheduleBoundaries(budget: Budget, through: string): string[] {
  if (
    budget.unit === null ||
    budget.startDate === null ||
    budget.interval === null ||
    budget.endsType === null
  ) {
    return [];
  }
  const rule: RecurrenceRule = {
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
  return expandRecurrenceOccurrences(rule, budget.startDate, through);
}

// The linked income's *effective* occurrence dates: moved dates move the
// boundary; skipped occurrences produce no boundary at all (the cycle just
// extends through that point, per SPEC.md). Expands past `through` first
// (OVERRIDE_LOOKAHEAD_DAYS) so an occurrence moved from after `through` to
// on/before it is still caught, then filters the *effective* dates to
// <= through - a raw occurrence moved from before `through` to after it is
// correctly dropped this way too.
function linkedIncomeBoundaries(income: RecurringItem, overrides: OccurrenceOverride[], through: string): string[] {
  const rule: RecurrenceRule = {
    startDate: income.startDate,
    interval: income.interval,
    unit: income.unit,
    weekdays: income.weekdays,
    daysOfMonth: income.daysOfMonth,
    ordinal: income.ordinal,
    ordinalWeekday: income.ordinalWeekday,
    endsType: income.endsType,
    endDate: income.endDate,
    occurrenceCount: income.occurrenceCount,
  };
  const raw = expandRecurrenceOccurrences(rule, income.startDate, addDays(through, OVERRIDE_LOOKAHEAD_DAYS));

  const overridesByDate = new Map(
    overrides.filter((o) => o.recurringItemId === income.id).map((o) => [o.originalDate, o]),
  );

  const dates: string[] = [];
  for (const date of raw) {
    const override = overridesByDate.get(date);
    if (override?.skipped) continue;
    const effectiveDate = override?.newDate ?? date;
    if (effectiveDate <= through) dates.push(effectiveDate);
  }
  return dates.sort();
}

// Resolves which schedule source governs a budget's cycle boundaries, per
// SPEC.md: linked income (if set and still a real income item) > the
// budget's own schedule (if configured) > fallback (monthly on the 1st).
// Falling through to a later source is based on whether that source is
// *configured*, not whether it happens to produce any boundaries by
// `through` (e.g. an own schedule that hasn't started yet is still the
// source - see the empty-boundaries handling in computeBudgetCycleStatus).
function resolveBoundaries(
  budget: Budget,
  recurringItems: RecurringItem[],
  overrides: OccurrenceOverride[],
  through: string,
): { boundaries: string[]; source: BudgetScheduleSource } {
  if (budget.linkedIncomeId !== null) {
    const income = recurringItems.find((item) => item.id === budget.linkedIncomeId && item.type === "income");
    if (income) {
      return { boundaries: linkedIncomeBoundaries(income, overrides, through), source: "linked_income" };
    }
    // linked_income_id points at a deleted/non-income item - fall through.
  }
  if (budget.unit !== null) {
    return { boundaries: ownScheduleBoundaries(budget, through), source: "own_schedule" };
  }
  return { boundaries: fallbackBoundaries(budget.createdAt, through), source: "fallback" };
}

function spentInRange(entries: BudgetEntry[], budgetId: string, startInclusive: string | null, endExclusive: string | null): number {
  return entries
    .filter(
      (e) =>
        e.budgetId === budgetId &&
        (startInclusive === null || e.entryDate >= startInclusive) &&
        (endExclusive === null || e.entryDate < endExclusive),
    )
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * The budget's current-cycle status: how much is available this cycle
 * (allocation plus any carried-over remainder/deficit from the previous
 * cycle), how much has been spent, and what's left or over.
 *
 * Cycle k spans [boundaryₖ, boundaryₖ₊₁); entries dated exactly on a
 * boundary belong to the NEW cycle starting there. Entries dated before
 * the very first boundary fold into cycle 0 (there's no "cycle -1").
 * availableₖ = allocation + (carryoverEnabled ? availableₖ₋₁ − spentₖ₋₁ : 0),
 * so carryover can go negative if a prior cycle overspent.
 */
export function computeBudgetCycleStatus(
  budget: Budget,
  allEntries: BudgetEntry[],
  recurringItems: RecurringItem[],
  overrides: OccurrenceOverride[],
  today: string,
): BudgetCycleStatus {
  // Anything dated after "today" hasn't happened yet from this status's
  // point of view, regardless of which cycle it would nominally fall into.
  const entries = allEntries.filter((e) => e.entryDate <= today);
  const { boundaries, source } = resolveBoundaries(budget, recurringItems, overrides, today);

  if (boundaries.length === 0) {
    // The schedule hasn't produced any occurrence by today (e.g. an own
    // schedule or linked income that starts in the future) - a single
    // ongoing cycle with no prior history to carry over.
    const spent = spentInRange(entries, budget.id, null, null);
    return {
      source,
      currentCycleStart: today,
      allocation: budget.allocation,
      carriedIn: 0,
      spent,
      remaining: Math.max(budget.allocation - spent, 0),
      over: Math.max(spent - budget.allocation, 0),
    };
  }

  let available = budget.allocation;
  let spent = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const rangeStart = i === 0 ? null : boundaries[i];
    const rangeEnd = i + 1 < boundaries.length ? boundaries[i + 1] : null;
    const cycleSpent = spentInRange(entries, budget.id, rangeStart, rangeEnd);
    if (i > 0) {
      available = budget.allocation + (budget.carryoverEnabled ? available - spent : 0);
    }
    spent = cycleSpent;
  }

  return {
    source,
    currentCycleStart: boundaries[boundaries.length - 1],
    allocation: budget.allocation,
    carriedIn: available - budget.allocation,
    spent,
    remaining: Math.max(available - spent, 0),
    over: Math.max(spent - available, 0),
  };
}

/**
 * Forecast rows for a budget (SPEC.md "Forecast integration"): one row for
 * the current cycle's remaining amount dated today (omitted when 0), and
 * one row per future cycle boundary within the horizon at the full
 * allocation. Not yet called by forecast.ts - T39 wires this in once
 * forecastData.ts actually fetches budgets/budget_entries.
 */
export function expandBudgetCycleOccurrences(
  budget: Budget,
  entries: BudgetEntry[],
  recurringItems: RecurringItem[],
  overrides: OccurrenceOverride[],
  today: string,
  horizon: string,
): BudgetOccurrence[] {
  const occurrences: BudgetOccurrence[] = [];

  const status = computeBudgetCycleStatus(budget, entries, recurringItems, overrides, today);
  if (status.remaining > 0) {
    occurrences.push({ date: today, amount: -status.remaining });
  }

  const { boundaries } = resolveBoundaries(budget, recurringItems, overrides, horizon);
  for (const date of boundaries) {
    if (date > today) {
      occurrences.push({ date, amount: -budget.allocation });
    }
  }

  return occurrences;
}
