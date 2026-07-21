import type { RecurrenceUnit } from "./engine/types";
import { daysInMonth } from "./engine/date-utils";
import { ordinalSuffix } from "./recurrenceSummary";

// Contextual recurrence presets (SPEC.md T35), computed from the chosen
// start date - e.g. "Monthly on the 21st" only makes sense once you know
// which day the 21st refers to. Presets only describe the repeat shape
// (interval/unit/weekdays/daysOfMonth/ordinal pair); "Ends" is a separate,
// always-visible control in the picker, not part of a preset.

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const ORDINAL_WORDS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth" };

export type RecurrenceShape = {
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
};

export type RecurrencePreset = {
  id: string;
  label: string;
  rule: RecurrenceShape;
};

function dowOf(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
}

// The nth-weekday preset for start_date's own position in its month: "the
// last X" if no later occurrence of that weekday exists in the month,
// otherwise "the Nth X" (always resolves to 1-4, matching the supported
// ordinal range - see resolveOrdinalWeekday in recurrence.ts).
function ordinalPreset(startDate: string): RecurrencePreset {
  const [year, month, day] = startDate.split("-").map(Number);
  const weekday = dowOf(startDate);
  const weekdayName = WEEKDAY_NAMES[weekday];
  const isLastOccurrence = day + 7 > daysInMonth(year, month);

  if (isLastOccurrence) {
    return {
      id: "monthly-ordinal",
      label: `Monthly on the last ${weekdayName}`,
      rule: { interval: 1, unit: "month", weekdays: null, daysOfMonth: null, ordinal: -1, ordinalWeekday: weekday },
    };
  }

  const ordinal = Math.ceil(day / 7);
  const word = ORDINAL_WORDS[ordinal] ?? `${ordinal}th`;
  return {
    id: "monthly-ordinal",
    label: `Monthly on the ${word} ${weekdayName}`,
    rule: { interval: 1, unit: "month", weekdays: null, daysOfMonth: null, ordinal, ordinalWeekday: weekday },
  };
}

export function computeRecurrencePresets(startDate: string): RecurrencePreset[] {
  const [, , day] = startDate.split("-").map(Number);
  const weekday = dowOf(startDate);
  const weekdayName = WEEKDAY_NAMES[weekday];

  return [
    {
      id: "monthly-day",
      label: `Monthly on the ${day}${ordinalSuffix(day)}`,
      rule: { interval: 1, unit: "month", weekdays: null, daysOfMonth: [day], ordinal: null, ordinalWeekday: null },
    },
    {
      id: "weekly",
      label: `Weekly on ${weekdayName}`,
      rule: { interval: 1, unit: "week", weekdays: [weekday], daysOfMonth: null, ordinal: null, ordinalWeekday: null },
    },
    {
      id: "biweekly",
      label: `Every 2 weeks on ${weekdayName}`,
      rule: { interval: 2, unit: "week", weekdays: [weekday], daysOfMonth: null, ordinal: null, ordinalWeekday: null },
    },
    {
      id: "semi-monthly",
      label: "Every 15th and 30th",
      rule: { interval: 1, unit: "month", weekdays: null, daysOfMonth: [15, 30], ordinal: null, ordinalWeekday: null },
    },
    ordinalPreset(startDate),
  ];
}

export function recurrenceShapesEqual(a: RecurrenceShape, b: RecurrenceShape): boolean {
  const arraysEqual = (x: number[] | null, y: number[] | null) => {
    if (x === null || y === null) return x === y;
    if (x.length !== y.length) return false;
    const sortedX = [...x].sort((p, q) => p - q);
    const sortedY = [...y].sort((p, q) => p - q);
    return sortedX.every((v, i) => v === sortedY[i]);
  };

  return (
    a.interval === b.interval &&
    a.unit === b.unit &&
    a.ordinal === b.ordinal &&
    a.ordinalWeekday === b.ordinalWeekday &&
    arraysEqual(a.weekdays, b.weekdays) &&
    arraysEqual(a.daysOfMonth, b.daysOfMonth)
  );
}
