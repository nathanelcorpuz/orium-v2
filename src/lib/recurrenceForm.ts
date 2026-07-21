import type { RecurrenceEndsType, RecurrenceUnit } from "./engine/types";

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

  let endDate: string | null = null;
  let occurrenceCount: number | null = null;
  if (endsType === "on_date") {
    endDate = (formData.get("endDate") as string) || null;
    if (!endDate) return { error: "Choose an end date." };
  } else if (endsType === "after_count") {
    const count = Number(formData.get("occurrenceCount"));
    if (!Number.isInteger(count) || count < 1) {
      return { error: "Enter how many times this repeats." };
    }
    occurrenceCount = count;
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
