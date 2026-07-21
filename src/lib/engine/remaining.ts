import type { RecurrenceEndsType, RecurrenceRule, RecurrenceUnit } from "./types";
import { expandMonthlyOccurrences } from "./monthly";
import { expandRecurrenceOccurrences } from "./recurrence";

// Safe upper bound for "sum every remaining occurrence" queries against
// on_date/after_count rules: their own ends logic (recurrence.ts) always
// stops generation before this is ever reached, so it's a technically
// required window end, not a real cap on how far the total can look.
const FAR_FUTURE_DATE = "9999-12-31";

type RuleShapedItem = {
  startDate: string;
  endDate: string | null;
  interval?: number | null;
  unit?: RecurrenceUnit | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  ordinal?: number | null;
  ordinalWeekday?: number | null;
  endsType?: RecurrenceEndsType | null;
  occurrenceCount?: number | null;
};

function toRecurrenceRule(item: RuleShapedItem & { interval: number; unit: RecurrenceUnit; endsType: RecurrenceEndsType }): RecurrenceRule {
  return {
    startDate: item.startDate,
    interval: item.interval,
    unit: item.unit,
    weekdays: item.weekdays ?? null,
    daysOfMonth: item.daysOfMonth ?? null,
    ordinal: item.ordinal ?? null,
    ordinalWeekday: item.ordinalWeekday ?? null,
    endsType: item.endsType,
    endDate: item.endDate,
    occurrenceCount: item.occurrenceCount ?? null,
  };
}

// Sum of a recurring item's remaining occurrence amounts, from `today`
// through the rule's own end (e.g. total left to pay off a debt, or total
// left to contribute toward a savings goal). Returns null for
// ends_type="never" items, which have no finite total by definition
// (SPEC.md: "ends_type=never items are excluded from finite remaining
// total stats") — callers should exclude nulls when summing across items,
// and show something like "Ongoing" per item.
//
// Dispatches like forecast.ts/monthlyEquivalent: items with the new
// recurrence columns populated (every row after T35) use the general
// engine; items missing them fall back to the legacy monthly-only
// expansion (kept for defensive robustness, not expected to trigger on
// fresh data once every page fetches the new columns).
export function remainingTotal(
  item: RuleShapedItem & { amount: number; dayOfMonth: number | null },
  today: string,
): number | null {
  if (item.interval != null && item.unit != null && item.endsType != null) {
    if (item.endsType === "never") return null;
    const occurrences = expandRecurrenceOccurrences(
      toRecurrenceRule({ ...item, interval: item.interval, unit: item.unit, endsType: item.endsType }),
      today,
      FAR_FUTURE_DATE,
    );
    return occurrences.length * Math.abs(item.amount);
  }

  if (item.endDate === null) return 0;
  const occurrences = expandMonthlyOccurrences(
    { startDate: item.startDate, endDate: item.endDate, dayOfMonth: item.dayOfMonth },
    today,
    item.endDate,
  );
  return occurrences.length * Math.abs(item.amount);
}

// The rule's own terminal date, independent of "today" — unlike
// remainingTotal, this isn't "what's left," it's "when does this rule
// stop happening at all" (e.g. a Dashboard debt-free date). For
// ends_type="on_date" that's just end_date; for "after_count" there's no
// stored date, so the Nth occurrence is computed directly from start_date
// (not "today", so an already-fully-elapsed item still reports its real
// completion date rather than nothing). Returns null for "never" (no
// terminal date exists) or if a rule/legacy item somehow has no
// occurrences at all.
export function ruleEndDate(item: RuleShapedItem): string | null {
  if (item.interval != null && item.unit != null && item.endsType != null) {
    if (item.endsType === "never") return null;
    if (item.endsType === "on_date") return item.endDate;

    const occurrences = expandRecurrenceOccurrences(
      toRecurrenceRule({ ...item, interval: item.interval, unit: item.unit, endsType: item.endsType }),
      item.startDate,
      FAR_FUTURE_DATE,
    );
    return occurrences.length > 0 ? occurrences[occurrences.length - 1] : null;
  }

  return item.endDate;
}
