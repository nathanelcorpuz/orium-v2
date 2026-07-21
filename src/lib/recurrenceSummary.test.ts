import { describe, expect, it } from "vitest";
import { summarizeRecurrence } from "./recurrenceSummary";
import type { RecurrenceRule } from "./engine/types";

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    startDate: "2026-01-01",
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    ordinal: null,
    ordinalWeekday: null,
    endsType: "never",
    endDate: null,
    occurrenceCount: null,
    ...overrides,
  };
}

describe("summarizeRecurrence", () => {
  it("matches the spec example: every 2 weeks on Sat, until a date", () => {
    const summary = summarizeRecurrence(
      rule({ unit: "week", interval: 2, weekdays: [6], endsType: "on_date", endDate: "2030-04-15" }),
    );
    expect(summary).toBe("Every 2 weeks on Sat · until Apr 2030");
  });

  it("weekly on a single weekday", () => {
    expect(summarizeRecurrence(rule({ unit: "week", interval: 1, weekdays: [2] }))).toBe(
      "Weekly on Tue",
    );
  });

  it("weekly on multiple weekdays, sorted regardless of input order", () => {
    expect(summarizeRecurrence(rule({ unit: "week", interval: 2, weekdays: [4, 1] }))).toBe(
      "Every 2 weeks on Mon, Thu",
    );
  });

  it("monthly on a single day, with ordinal suffix", () => {
    expect(summarizeRecurrence(rule({ daysOfMonth: [21] }))).toBe("Monthly on the 21st");
  });

  it("monthly on two days (the 15th and 30th)", () => {
    expect(summarizeRecurrence(rule({ daysOfMonth: [15, 30] }))).toBe(
      "Monthly on the 15th and 30th",
    );
  });

  it("every N months on three or more days, oxford-comma joined", () => {
    expect(summarizeRecurrence(rule({ interval: 3, daysOfMonth: [1, 11, 21] }))).toBe(
      "Every 3 months on the 1st, 11th, and 21st",
    );
  });

  it("monthly on the nth weekday (ordinal)", () => {
    expect(
      summarizeRecurrence(rule({ daysOfMonth: null, ordinal: 3, ordinalWeekday: 2 })),
    ).toBe("Monthly on the third Tue");
  });

  it("monthly on the last weekday (ordinal = -1)", () => {
    expect(
      summarizeRecurrence(rule({ daysOfMonth: null, ordinal: -1, ordinalWeekday: 5 })),
    ).toBe("Monthly on the last Fri");
  });

  it("daily, single and multi-day interval", () => {
    expect(summarizeRecurrence(rule({ unit: "day", daysOfMonth: null }))).toBe("Every day");
    expect(summarizeRecurrence(rule({ unit: "day", interval: 3, daysOfMonth: null }))).toBe(
      "Every 3 days",
    );
  });

  it("yearly, reading the month/day from start_date", () => {
    expect(
      summarizeRecurrence(rule({ unit: "year", startDate: "2026-08-15", daysOfMonth: null })),
    ).toBe("Yearly on Aug 15");
  });

  it("every N years", () => {
    expect(
      summarizeRecurrence(
        rule({ unit: "year", interval: 2, startDate: "2024-02-29", daysOfMonth: null }),
      ),
    ).toBe("Every 2 years on Feb 29");
  });

  it("ends: never - no suffix", () => {
    expect(summarizeRecurrence(rule({ endsType: "never" }))).toBe("Monthly on the 1st");
  });

  it("ends: on_date - month/year suffix", () => {
    expect(
      summarizeRecurrence(rule({ endsType: "on_date", endDate: "2027-11-03" })),
    ).toBe("Monthly on the 1st · until Nov 2027");
  });

  it("ends: after_count, singular vs plural", () => {
    expect(
      summarizeRecurrence(rule({ endsType: "after_count", occurrenceCount: 1 })),
    ).toBe("Monthly on the 1st · 1 time");
    expect(
      summarizeRecurrence(rule({ endsType: "after_count", occurrenceCount: 6 })),
    ).toBe("Monthly on the 1st · 6 times");
  });
});
