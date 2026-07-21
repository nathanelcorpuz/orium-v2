import { describe, expect, it } from "vitest";
import { computeRecurrencePresets, recurrenceShapesEqual } from "./recurrencePresets";

describe("computeRecurrencePresets", () => {
  it("matches the spec's example labels for a mid-month Tuesday start date", () => {
    // 2026-01-20 is a Tuesday (verified against Node's Date in the T34 session).
    const presets = computeRecurrencePresets("2026-01-20");
    expect(presets.map((p) => p.label)).toEqual([
      "Monthly on the 20th",
      "Weekly on Tuesday",
      "Every 2 weeks on Tuesday",
      "Every 15th and 30th",
      "Monthly on the third Tuesday",
    ]);
  });

  it("ordinal preset offers 'last' when start_date is the month's final occurrence of that weekday", () => {
    // 2026-01-27 is the last Tuesday of January 2026 (next would be Feb 3).
    const presets = computeRecurrencePresets("2026-01-27");
    const ordinal = presets.find((p) => p.id === "monthly-ordinal");
    expect(ordinal?.label).toBe("Monthly on the last Tuesday");
    expect(ordinal?.rule).toEqual({
      interval: 1,
      unit: "month",
      weekdays: null,
      daysOfMonth: null,
      ordinal: -1,
      ordinalWeekday: 2,
    });
  });

  it("ordinal preset counts forward (not 'last') for an early-month date with a later occurrence", () => {
    // 2026-01-06 is the first Tuesday of January 2026.
    const presets = computeRecurrencePresets("2026-01-06");
    const ordinal = presets.find((p) => p.id === "monthly-ordinal");
    expect(ordinal?.label).toBe("Monthly on the first Tuesday");
  });

  it("day-of-month preset uses the correct ordinal suffix (1st/2nd/3rd/11th)", () => {
    expect(computeRecurrencePresets("2026-01-01")[0].label).toBe("Monthly on the 1st");
    expect(computeRecurrencePresets("2026-01-02")[0].label).toBe("Monthly on the 2nd");
    expect(computeRecurrencePresets("2026-01-03")[0].label).toBe("Monthly on the 3rd");
    expect(computeRecurrencePresets("2026-01-11")[0].label).toBe("Monthly on the 11th");
  });
});

describe("recurrenceShapesEqual", () => {
  const base = { interval: 1, unit: "week" as const, weekdays: [1, 3], daysOfMonth: null, ordinal: null, ordinalWeekday: null };

  it("treats weekday arrays as equal regardless of order", () => {
    expect(recurrenceShapesEqual(base, { ...base, weekdays: [3, 1] })).toBe(true);
  });

  it("detects a difference in interval", () => {
    expect(recurrenceShapesEqual(base, { ...base, interval: 2 })).toBe(false);
  });

  it("treats null and a populated array as unequal", () => {
    expect(recurrenceShapesEqual(base, { ...base, weekdays: null })).toBe(false);
  });

  it("treats two nulls as equal", () => {
    expect(recurrenceShapesEqual({ ...base, weekdays: null }, { ...base, weekdays: null })).toBe(true);
  });
});
