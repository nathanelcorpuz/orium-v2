import { describe, expect, it } from "vitest";
import { expandRecurrenceOccurrences } from "./recurrence";
import type { RecurrenceRule } from "./types";

// Shared defaults so each test only overrides what it's testing.
function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    startDate: "2026-01-01",
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: null,
    endsType: "on_date",
    endDate: "2026-12-31",
    occurrenceCount: null,
    ...overrides,
  };
}

describe("expandRecurrenceOccurrences - month unit (parity with the old monthly engine)", () => {
  it("clamps day 31 to the last day of shorter months (Feb/Apr)", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [31], startDate: "2026-01-01", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-04-30",
    );
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [31], startDate: "2028-02-01", endDate: "2028-02-29" }),
      "2028-02-01",
      "2028-02-29",
    );
    expect(dates).toEqual(["2028-02-29"]);
  });

  it("delays occurrences until the item's own start_date", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [15], startDate: "2026-03-01", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
      "2026-07-15",
      "2026-08-15",
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
      "2026-12-15",
    ]);
  });

  it("cuts off occurrences after the item's own end_date", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [15], startDate: "2026-01-01", endDate: "2026-03-31" }),
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("is bounded by the forecast window, not just the item's dates", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [10], startDate: "2020-01-01", endDate: "2030-12-31" }),
      "2026-06-01",
      "2026-06-30",
    );
    expect(dates).toEqual(["2026-06-10"]);
  });
});

describe("expandRecurrenceOccurrences - week unit (parity with the old weekly/biweekly engine)", () => {
  it("generates occurrences every 7 days anchored on start_date", () => {
    // 2026-01-07 is a Wednesday (weekday 3).
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "week", weekdays: [3], startDate: "2026-01-07", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-02-01",
    );
    expect(dates).toEqual(["2026-01-07", "2026-01-14", "2026-01-21", "2026-01-28"]);
  });

  it("skips ahead to the first occurrence within the window without breaking the anchor", () => {
    // 2026-01-01 is a Thursday (weekday 4).
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "week", weekdays: [4], startDate: "2026-01-01", endDate: "2026-12-31" }),
      "2026-02-10",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-02-12", "2026-02-19", "2026-02-26"]);
  });

  it("generates occurrences every 14 days anchored mid-week across a month boundary", () => {
    // 2026-01-14 is a Wednesday (weekday 3).
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "week", interval: 2, weekdays: [3], startDate: "2026-01-14", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-01-14", "2026-01-28", "2026-02-11", "2026-02-25"]);
  });

  it("returns an empty array when the item's range never overlaps the window", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "week", interval: 2, weekdays: [3], startDate: "2020-01-01", endDate: "2020-12-31" }),
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
  });
});

describe("expandRecurrenceOccurrences - February clamp via days_of_month=[15,30] (replaces semi_monthly_15_30)", () => {
  it("generates the 15th and 30th of ordinary months, and 15th + Feb's actual last day", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [15, 30], startDate: "2026-01-01", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-03-31",
    );
    expect(dates).toEqual([
      "2026-01-15",
      "2026-01-30",
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
      "2026-03-30",
    ]);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [15, 30], startDate: "2028-01-01", endDate: "2028-12-31" }),
      "2028-02-01",
      "2028-02-29",
    );
    expect(dates).toEqual(["2028-02-15", "2028-02-29"]);
  });
});

describe("expandRecurrenceOccurrences - new cases required by T33", () => {
  it("every-2-weeks multi-weekday: emits both weekdays only in qualifying weeks", () => {
    // 2026-01-05 is a Monday (weekday 1); weekdays = Mon(1) and Thu(4).
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "week", interval: 2, weekdays: [1, 4], startDate: "2026-01-05", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-02-28",
    );
    expect(dates).toEqual([
      "2026-01-05",
      "2026-01-08",
      "2026-01-19",
      "2026-01-22",
      "2026-02-02",
      "2026-02-05",
      "2026-02-16",
      "2026-02-19",
    ]);
  });

  it("interval-3 months: emits every third month from start_date", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "month", interval: 3, daysOfMonth: [1], startDate: "2026-01-01", endDate: "2027-12-31" }),
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
  });

  it("after_count: stops once N occurrences have been emitted, regardless of the window", () => {
    const dates = expandRecurrenceOccurrences(
      rule({
        unit: "month",
        daysOfMonth: [1],
        startDate: "2026-01-01",
        endsType: "after_count",
        endDate: null,
        occurrenceCount: 3,
      }),
      "2026-01-01",
      "2030-12-31",
    );
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("after_count: excludes elapsed occurrences from the output but still counts them", () => {
    const dates = expandRecurrenceOccurrences(
      rule({
        unit: "month",
        daysOfMonth: [1],
        startDate: "2026-01-01",
        endsType: "after_count",
        endDate: null,
        occurrenceCount: 3,
      }),
      "2026-03-01",
      "2030-12-31",
    );
    // 3 occurrences total (Jan, Feb, Mar 1); only Mar 1 is on/after the window start.
    expect(dates).toEqual(["2026-03-01"]);
  });

  it("after_count: empty once all N occurrences are already in the past", () => {
    const dates = expandRecurrenceOccurrences(
      rule({
        unit: "month",
        daysOfMonth: [1],
        startDate: "2026-01-01",
        endsType: "after_count",
        endDate: null,
        occurrenceCount: 3,
      }),
      "2026-04-01",
      "2030-12-31",
    );
    expect(dates).toEqual([]);
  });

  it("never: generates all the way to the window/horizon with no cutoff of its own", () => {
    const dates = expandRecurrenceOccurrences(
      rule({
        unit: "month",
        daysOfMonth: [1],
        startDate: "2020-01-01",
        endsType: "never",
        endDate: null,
      }),
      "2026-01-01",
      "2026-06-30",
    );
    expect(dates).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });
});

describe("expandRecurrenceOccurrences - day and year units", () => {
  it("day: steps every `interval` days from start_date", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "day", interval: 3, startDate: "2026-01-01", endDate: "2026-01-31" }),
      "2026-01-01",
      "2026-01-10",
    );
    expect(dates).toEqual(["2026-01-01", "2026-01-04", "2026-01-07", "2026-01-10"]);
  });

  it("year: repeats start_date's month/day every `interval` years, clamping Feb 29", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ unit: "year", startDate: "2024-02-29", endDate: "2032-12-31" }),
      "2024-01-01",
      "2028-12-31",
    );
    expect(dates).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
});
