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

// computeBudgetCycleStatus needs to know the current cycle's END boundary
// (SPEC.md T43) even when the caller has no real forecast horizon handy
// (BudgetCard.tsx, BudgetsPanel.tsx, the Dashboard card) - this is the
// default lookahead used to find it. Generous enough for any realistic
// budget cadence (monthly, weekly, custom up to ~1yr); callers that DO have
// a real horizon (expandBudgetCycleOccurrences, via forecastData.ts's 3yr
// horizon) pass it explicitly for exact accuracy instead of relying on this.
const DEFAULT_STATUS_LOOKAHEAD_DAYS = 366;

export type BudgetScheduleSource = "linked_income" | "own_schedule" | "fallback";

export interface BudgetCycleStatus {
  source: BudgetScheduleSource;
  currentCycleStart: string;
  currentCycleEnd: string | null; // next boundary after currentCycleStart, if known within the lookahead/horizon; null if open-ended
  allocation: number; // centavos, this cycle's full replenishment
  carriedIn: number; // available - allocation; 0 if no prior cycle, may be negative
  spent: number; // centavos, this cycle's logged spends (T43: includes future-dated entries within this cycle)
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

// A linked income or own-schedule budget reuses that schedule's occurrences
// verbatim, which can start long before the budget itself existed (e.g. a
// budget linked today to an income running since January). Without this,
// computeBudgetCycleStatus would walk every one of those pre-existence
// cycles with zero spend against them, and with carryover enabled each
// contributes its full allocation - the same "phantom accumulated
// allowance" bug fallbackBoundaries was anchored to createdAt to avoid
// (SPEC.md T37), just via a different boundary source. Fix: drop every
// boundary before the most recent one at-or-before the budget's createdAt,
// so cycle 0 starts there instead of at the schedule's own origin.
// fallbackBoundaries doesn't need this - it already starts at createdAt.
function clipToCreation(boundaries: string[], createdAt: string): string[] {
  let anchorIndex = -1;
  for (let i = 0; i < boundaries.length; i++) {
    if (boundaries[i] <= createdAt) anchorIndex = i;
  }
  return anchorIndex <= 0 ? boundaries : boundaries.slice(anchorIndex);
}

// Resolves which schedule source governs a budget's cycle boundaries, per
// SPEC.md: linked income (if set and still a real income item) > the
// budget's own schedule (if configured) > fallback (monthly on the 1st).
// Falling through to a later source is based on whether that source is
// *configured*, not whether it happens to produce any boundaries by
// `through` (e.g. an own schedule that hasn't started yet is still the
// source - see the empty-boundaries handling in computeBudgetCycleStatus).
// Exported for the T42 part-A stale-cleanup check on a budget's own rule
// edits (see src/app/budgets/actions.ts) - it needs to ask "is this date
// still a real boundary under the new rule?" the same way
// computeBudgetCycleStatus/expandBudgetCycleOccurrences already do
// internally.
export function resolveBoundaries(
  budget: Budget,
  recurringItems: RecurringItem[],
  overrides: OccurrenceOverride[],
  through: string,
): { boundaries: string[]; source: BudgetScheduleSource } {
  if (budget.linkedIncomeId !== null) {
    const income = recurringItems.find((item) => item.id === budget.linkedIncomeId && item.type === "income");
    if (income) {
      const boundaries = clipToCreation(linkedIncomeBoundaries(income, overrides, through), budget.createdAt);
      return { boundaries, source: "linked_income" };
    }
    // linked_income_id points at a deleted/non-income item - fall through.
  }
  if (budget.unit !== null) {
    const boundaries = clipToCreation(ownScheduleBoundaries(budget, through), budget.createdAt);
    return { boundaries, source: "own_schedule" };
  }
  return { boundaries: fallbackBoundaries(budget.createdAt, through), source: "fallback" };
}

// e.direction !== "incoming" (rather than === "outgoing") so entries from
// before Phase 10 (direction undefined) still count as spends, unchanged -
// only entries explicitly marked "incoming" (a Phase 10 ledger credit, e.g.
// a "Starting balance" bootstrap row) are excluded. This cycle model
// predates directioned entries entirely; it was never meant to see credits,
// so it just ignores them rather than being taught to understand them.
function spentInRange(entries: BudgetEntry[], budgetId: string, startInclusive: string | null, endExclusive: string | null): number {
  return entries
    .filter(
      (e) =>
        e.budgetId === budgetId &&
        e.direction !== "incoming" &&
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
 *
 * SPEC.md T43: an entry dated after `today` is no longer excluded - it
 * counts toward whichever cycle it actually falls in, same as a past entry.
 * `currentCycleEnd` (the next boundary, found via `horizon` - defaulted for
 * callers with no real forecast horizon) is what makes this possible: it
 * bounds the current cycle's spending window so a future-dated entry that
 * belongs to a LATER cycle doesn't leak into this one.
 */
export function computeBudgetCycleStatus(
  budget: Budget,
  entries: BudgetEntry[],
  recurringItems: RecurringItem[],
  overrides: OccurrenceOverride[],
  today: string,
  horizon: string = addDays(today, DEFAULT_STATUS_LOOKAHEAD_DAYS),
): BudgetCycleStatus {
  const { boundaries: allBoundaries, source } = resolveBoundaries(budget, recurringItems, overrides, horizon);
  const boundaries = allBoundaries.filter((d) => d <= today);
  const nextBoundary = allBoundaries.find((d) => d > today) ?? null;

  if (boundaries.length === 0) {
    // The schedule hasn't produced any occurrence by today (e.g. an own
    // schedule or linked income that starts in the future) - a single
    // ongoing cycle with no prior history to carry over, bounded above by
    // the schedule's first-ever boundary if one exists within `horizon`.
    const spent = spentInRange(entries, budget.id, null, nextBoundary);
    return {
      source,
      currentCycleStart: today,
      currentCycleEnd: nextBoundary,
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
    // Every cycle except the current (last) one is fully bounded by the
    // next PAST boundary already in `boundaries`. The current cycle's
    // upper bound is `nextBoundary` instead of unbounded - see docstring.
    const rangeEnd = i + 1 < boundaries.length ? boundaries[i + 1] : nextBoundary;
    const cycleSpent = spentInRange(entries, budget.id, rangeStart, rangeEnd);
    if (i > 0) {
      available = budget.allocation + (budget.carryoverEnabled ? available - spent : 0);
    }
    spent = cycleSpent;
  }

  return {
    source,
    currentCycleStart: boundaries[boundaries.length - 1],
    currentCycleEnd: nextBoundary,
    allocation: budget.allocation,
    carriedIn: available - budget.allocation,
    spent,
    remaining: Math.max(available - spent, 0),
    over: Math.max(spent - available, 0),
  };
}

// Entries dated after `today` (SPEC.md T43) - these render as their own
// Forecast rows (forecast.ts) rather than being folded silently into a
// cycle-boundary row's amount. Exported so forecast.ts can build those rows
// directly; expandBudgetCycleOccurrences below uses it to subtract the same
// entries from whichever boundary row they'd otherwise inflate, so the two
// never double-count.
export function futureBudgetEntries(entries: BudgetEntry[], budgetId: string, today: string): BudgetEntry[] {
  return entries
    .filter((e) => e.budgetId === budgetId && e.entryDate > today)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0));
}

/**
 * Forecast rows for a budget (SPEC.md "Forecast integration"): one row for
 * the current cycle's remaining amount dated today (omitted when 0), and
 * one row per future cycle boundary within the horizon at the full
 * allocation.
 *
 * SPEC.md T43: a future-dated entry gets its OWN Forecast row (built by
 * forecast.ts from futureBudgetEntries, not from here) instead of just
 * inflating a boundary row's total. So each boundary row here is reduced by
 * whichever future entries fall inside its own cycle - the current cycle's
 * "remaining" row by future entries before the next boundary, each future
 * "allocation" row by future entries before ITS next boundary - floored at
 * 0.
 *
 * SPEC.md Bug #4: the very next future boundary also carries forward
 * whatever's left unspent in the CURRENT cycle (when carryover is enabled) -
 * that leftover is fully known as of `today`, so e.g. logging a spend now
 * correctly reduces it. Boundaries beyond that one do NOT keep compounding
 * this projection forward - what happens during a not-yet-started cycle is
 * genuinely unknowable, and assuming zero spending forever would make
 * carryover-enabled budgets balloon without bound across a multi-year
 * horizon (a 3-year weekly budget would compound ~150 times).
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

  const status = computeBudgetCycleStatus(budget, entries, recurringItems, overrides, today, horizon);
  const futureEntries = futureBudgetEntries(entries, budget.id, today);

  const currentCycleFutureSpend = spentInRange(futureEntries, budget.id, status.currentCycleStart, status.currentCycleEnd);
  const unknownRemaining = Math.max(status.remaining - currentCycleFutureSpend, 0);
  if (unknownRemaining > 0) {
    occurrences.push({ date: today, amount: -unknownRemaining });
  }

  // What's left of the current cycle, fully known as of `today` - this is
  // what the very next future boundary (and only that one) carries forward.
  const currentCycleCarry = status.allocation + status.carriedIn - status.spent;

  const { boundaries } = resolveBoundaries(budget, recurringItems, overrides, horizon);
  const futureBoundaries = boundaries.filter((date) => date > today);
  for (let i = 0; i < futureBoundaries.length; i++) {
    const start = futureBoundaries[i];
    const end = i + 1 < futureBoundaries.length ? futureBoundaries[i + 1] : null;
    const knownSpend = spentInRange(futureEntries, budget.id, start, end);
    const available = budget.allocation + (i === 0 && budget.carryoverEnabled ? currentCycleCarry : 0);
    const remainingAllocation = Math.max(available - knownSpend, 0);
    // Guard against -0 (Math.max(...,0) - knownSpend can land exactly on 0)
    // - avoids a footgun for anything doing strict equality on this amount.
    occurrences.push({ date: start, amount: remainingAllocation > 0 ? -remainingAllocation : 0 });
  }

  return occurrences;
}
