import type { RecurrenceEndsType, RecurrenceUnit } from "./engine/types";
import { ruleEndDate } from "./engine/remaining";
import { addYears, MAX_TRACKING_YEARS } from "./engine/date-utils";
import { todayInManila } from "./date";

// Shared FormData parsing/validation for the RecurrencePicker component's
// fields (SPEC.md T35), used by all four recurring-item forms' Server
// Actions so the rules live in one place instead of four near-copies.

export type RecurrenceFormResult =
  | { error: string }
  | {
      error: null;
      interval: number;
      unit: RecurrenceUnit;
      weekdays: number[] | null;
      daysOfMonth: number[] | null;
      ordinal: number | null;
      ordinalWeekday: number | null;
      endsType: RecurrenceEndsType;
      endDate: string | null;
      occurrenceCount: number | null;
    };

const UNITS: RecurrenceUnit[] = ["day", "week", "month", "year"];
const ENDS_TYPES: RecurrenceEndsType[] = ["never", "on_date", "after_count"];

export function readRecurrenceRuleForm(formData: FormData): RecurrenceFormResult {
  const interval = Number(formData.get("interval"));
  const unitRaw = formData.get("unit") as string;
  const endsTypeRaw = formData.get("endsType") as string;
  // Present in the same <form> regardless of which component rendered it
  // (the parent's own Start Date field, a sibling of this picker) - see
  // T85's write-up in SPEC.md for why the cap below is anchored to today,
  // not to this start date.
  const startDate = formData.get("startDate") as string;

  if (!Number.isInteger(interval) || interval < 1) {
    return { error: "Repeat interval must be at least 1." };
  }
  if (!UNITS.includes(unitRaw as RecurrenceUnit)) return { error: "Choose how often this repeats." };
  if (!ENDS_TYPES.includes(endsTypeRaw as RecurrenceEndsType)) return { error: "Choose when this ends." };

  const unit = unitRaw as RecurrenceUnit;
  const endsType = endsTypeRaw as RecurrenceEndsType;

  const weekdays = formData.getAll("weekdays").map(Number);
  const daysOfMonth = formData.getAll("daysOfMonth").map(Number);
  const ordinalRaw = formData.get("ordinal") as string;
  const ordinalWeekdayRaw = formData.get("ordinalWeekday") as string;
  const ordinal = ordinalRaw ? Number(ordinalRaw) : null;
  const ordinalWeekday = ordinalWeekdayRaw ? Number(ordinalWeekdayRaw) : null;

  if (unit === "week" && weekdays.length === 0) {
    return { error: "Choose at least one weekday." };
  }
  if (unit === "month" && daysOfMonth.length === 0 && (ordinal === null || ordinalWeekday === null)) {
    return { error: "Choose a day of the month or a weekday pattern." };
  }

  // T85: the free-tier tracking cap, anchored to today (not to this rule's
  // own start date) - "5 years from present day" per the user's own
  // framing. Applies to the rule's start, an explicit on_date end, and an
  // after_count rule's resolved last occurrence alike.
  const maxTrackingDate = addYears(todayInManila(), MAX_TRACKING_YEARS);
  if (startDate && startDate > maxTrackingDate) {
    return { error: `Start date can't be more than ${MAX_TRACKING_YEARS} years from today.` };
  }

  let endDate: string | null = null;
  let occurrenceCount: number | null = null;
  if (endsType === "on_date") {
    endDate = (formData.get("endDate") as string) || null;
    if (!endDate) return { error: "Choose an end date." };
    if (endDate > maxTrackingDate) {
      return { error: `End date can't be more than ${MAX_TRACKING_YEARS} years from today.` };
    }
  } else if (endsType === "after_count") {
    const count = Number(formData.get("occurrenceCount"));
    if (!Number.isInteger(count) || count < 1) {
      return { error: "Enter how many times this repeats." };
    }
    occurrenceCount = count;

    const resolvedWeekdays = unit === "week" ? weekdays : null;
    const resolvedDaysOfMonth = unit === "month" && daysOfMonth.length > 0 ? daysOfMonth : null;
    const resolvedOrdinal = unit === "month" && daysOfMonth.length === 0 ? ordinal : null;
    const resolvedOrdinalWeekday = unit === "month" && daysOfMonth.length === 0 ? ordinalWeekday : null;
    const lastOccurrence = ruleEndDate({
      startDate,
      endDate: null,
      interval,
      unit,
      weekdays: resolvedWeekdays,
      daysOfMonth: resolvedDaysOfMonth,
      ordinal: resolvedOrdinal,
      ordinalWeekday: resolvedOrdinalWeekday,
      endsType: "after_count",
      occurrenceCount: count,
    });
    if (lastOccurrence && lastOccurrence > maxTrackingDate) {
      return {
        error: `That many occurrences would run past ${MAX_TRACKING_YEARS} years from today - lower the count or use an end date instead.`,
      };
    }
  }

  return {
    error: null,
    interval,
    unit,
    weekdays: unit === "week" ? weekdays : null,
    daysOfMonth: unit === "month" && daysOfMonth.length > 0 ? daysOfMonth : null,
    ordinal: unit === "month" && daysOfMonth.length === 0 ? ordinal : null,
    ordinalWeekday: unit === "month" && daysOfMonth.length === 0 ? ordinalWeekday : null,
    endsType,
    endDate,
    occurrenceCount,
  };
}
