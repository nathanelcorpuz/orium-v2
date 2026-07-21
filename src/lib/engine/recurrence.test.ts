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
    ordinal: null,
    ordinalWeekday: null,
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

describe("expandRecurrenceOccurrences - nth-weekday (ordinal) month rules, T34", () => {
  it("resolves the 3rd Tuesday of each month", () => {
    // ordinalWeekday 2 = Tuesday.
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: 3, ordinalWeekday: 2, startDate: "2026-01-01", endDate: "2026-04-30" }),
      "2026-01-01",
      "2026-04-30",
    );
    // Jan 2026: Tue 6,13,20 -> 3rd=20. Feb: Tue 3,10,17 -> 3rd=17.
    // Mar: Tue 3,10,17 -> 3rd=17. Apr: Tue 7,14,21 -> 3rd=21.
    expect(dates).toEqual(["2026-01-20", "2026-02-17", "2026-03-17", "2026-04-21"]);
  });

  it("resolves the last Friday of each month", () => {
    // ordinalWeekday 5 = Friday.
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: -1, ordinalWeekday: 5, startDate: "2026-01-01", endDate: "2026-03-31" }),
      "2026-01-01",
      "2026-03-31",
    );
    // Jan 2026's last day (31) is a Saturday, so last Friday = 30.
    // Feb's last day (28) is a Saturday, so last Friday = 27.
    // Mar's last day (31) is a Tuesday, so last Friday = 27.
    expect(dates).toEqual(["2026-01-30", "2026-02-27", "2026-03-27"]);
  });

  it("resolves the 1st Monday and 4th Monday of a month (ordinal boundaries)", () => {
    // 2026-02: Mondays fall on 2, 9, 16, 23.
    const first = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: 1, ordinalWeekday: 1, startDate: "2026-02-01", endDate: "2026-02-28" }),
      "2026-02-01",
      "2026-02-28",
    );
    const fourth = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: 4, ordinalWeekday: 1, startDate: "2026-02-01", endDate: "2026-02-28" }),
      "2026-02-01",
      "2026-02-28",
    );
    expect(first).toEqual(["2026-02-02"]);
    expect(fourth).toEqual(["2026-02-23"]);
  });

  it("handles the case where the month's last day is exactly the target weekday", () => {
    // 2026-01-31 is a Saturday, so "last Saturday" of Jan 2026 is the 31st itself.
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: -1, ordinalWeekday: 6, startDate: "2026-01-01", endDate: "2026-01-31" }),
      "2026-01-01",
      "2026-01-31",
    );
    expect(dates).toEqual(["2026-01-31"]);
  });

  it("returns an empty array for a month rule with neither daysOfMonth nor a complete ordinal pair", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: null, ordinal: null, ordinalWeekday: null, startDate: "2026-01-01", endDate: "2026-12-31" }),
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
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

describe("expandRecurrenceOccurrences - tight single-date window (T42 stale-override check)", () => {
  // deleteStaleOverrides (src/lib/staleOverrides.ts) asks "is this exact
  // date still produced by the rule?" via a [date, date] window rather than
  // a realistic today->horizon range - confirming that usage works
  // correctly, not just the wide-window case every other test exercises.
  it("reproduces the exact date when it's still a valid occurrence", () => {
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [15], startDate: "2026-01-01" }),
      "2026-03-15",
      "2026-03-15",
    );
    expect(dates).toEqual(["2026-03-15"]);
  });

  it("returns empty when the date is no longer produced by the rule", () => {
    // Rule changed from day-15 to day-1; the old day-15 date is stale.
    const dates = expandRecurrenceOccurrences(
      rule({ daysOfMonth: [1], startDate: "2026-01-01" }),
      "2026-03-15",
      "2026-03-15",
    );
    expect(dates).toEqual([]);
  });
});
