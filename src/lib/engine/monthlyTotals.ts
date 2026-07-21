import type { RecurrenceUnit, RecurringFrequency } from "./types";

const MONTHLY_MULTIPLIER: Record<RecurringFrequency, number> = {
  monthly: 1,
  weekly: 4,
  biweekly: 2,
  semi_monthly_15_30: 2,
};

// Generalized occurrences-per-month estimate (SPEC.md Phase 6A, supersedes
// the T22 preset table): day 30/interval, week (4 x len(weekdays))/interval,
// month (len(daysOfMonth) or 1)/interval - the "or 1" covers nth-weekday
// (ordinal) month rules too, since those always produce exactly one
// occurrence per period regardless of which weekday - year 1/(12*interval).
// Reproduces the old presets exactly: weekly=4, biweekly=2, semi-monthly=2,
// monthly=1 (verified in monthlyTotals.test.ts).
function occurrencesPerMonth(item: {
  interval: number;
  unit: RecurrenceUnit;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
}): number {
  let f: number;
  switch (item.unit) {
    case "day":
      f = 30 / item.interval;
      break;
    case "week":
      f = (4 * (item.weekdays?.length ?? 0)) / item.interval;
      break;
    case "month":
      f = (item.daysOfMonth?.length || 1) / item.interval;
      break;
    case "year":
      f = 1 / (12 * item.interval);
      break;
  }
  return Math.max(0, Math.round(f));
}

// Summary-stat estimate for "Total Monthly X" cards: integer multipliers,
// never 52/12-style fractional math. The forecast itself keeps using real
// occurrence dates (a 5-Saturday month genuinely shows 5 incomes) — only
// these summary totals use multipliers.
//
// Dispatches like forecast.ts: items with the new recurrence columns
// populated (every row after T35 - migrated rows via T32's backfill, new
// rows via the RecurrencePicker) use the generalized formula above; items
// missing them (e.g. IncomeRow, still fetched via a pre-T35-shaped query)
// fall back to the old preset table. `frequency` is optional since T35's
// BillRow has no legacy shape to fall back to at all - every bill has the
// new columns from the day it was written.
export function monthlyEquivalent(item: {
  amount: number;
  frequency?: RecurringFrequency;
  interval?: number | null;
  unit?: RecurrenceUnit | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
}): number {
  if (item.interval != null && item.unit != null) {
    const occurrences = occurrencesPerMonth({ ...item, interval: item.interval, unit: item.unit });
    // A rule with sub-monthly frequency (e.g. quarterly, yearly) rounds
    // occurrences down to 0; a negative amount x 0 is JS's -0, not 0 - `|| 0`
    // normalizes it so this never returns a signed zero.
    return item.amount * occurrences || 0;
  }
  // Neither shape present - shouldn't happen given the callers above, but
  // returning 0 beats a NaN from indexing MONTHLY_MULTIPLIER with undefined.
  if (item.frequency == null) return 0;
  return item.amount * MONTHLY_MULTIPLIER[item.frequency];
}
