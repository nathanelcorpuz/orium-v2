import { describe, expect, it } from "vitest";
import { remainingTotal, ruleEndDate } from "./remaining";

describe("remainingTotal - legacy monthly path (parity with the old remainingMonthlyTotal)", () => {
  it("sums the remaining occurrences through the item's own end_date", () => {
    const total = remainingTotal(
      { startDate: "2025-01-15", endDate: "2026-03-15", dayOfMonth: 15, amount: -500000 },
      "2026-01-01",
    );
    // Remaining occurrences from today (2026-01-01) through end_date: Jan 15, Feb 15, Mar 15
    expect(total).toBe(1500000);
  });

  it("excludes occurrences before today, even if the item started in the past", () => {
    const total = remainingTotal(
      { startDate: "2020-01-15", endDate: "2026-02-15", dayOfMonth: 15, amount: -100000 },
      "2026-02-01",
    );
    // Only Feb 15 remains
    expect(total).toBe(100000);
  });

  it("returns 0 once the item's end_date has passed", () => {
    const total = remainingTotal(
      { startDate: "2024-01-01", endDate: "2025-12-31", dayOfMonth: 1, amount: -200000 },
      "2026-01-01",
    );
    expect(total).toBe(0);
  });

  it("uses the absolute value of amount regardless of sign", () => {
    const total = remainingTotal(
      { startDate: "2026-01-01", endDate: "2026-01-31", dayOfMonth: 1, amount: 300000 },
      "2026-01-01",
    );
    expect(total).toBe(300000);
  });
});

describe("remainingTotal - generalized rule shape (T35)", () => {
  it("sums remaining occurrences for a weekly item through its on_date end", () => {
    const total = remainingTotal(
      {
        amount: -100000,
        startDate: "2026-01-05",
        endDate: "2026-01-26",
        dayOfMonth: null,
        interval: 1,
        unit: "week",
        weekdays: [1],
        endsType: "on_date",
      },
      "2026-01-01",
    );
    // Mondays Jan 5, 12, 19, 26 - all on/after today, all through end_date.
    expect(total).toBe(400000);
  });

  it("sums remaining occurrences for an after_count item regardless of end_date", () => {
    const total = remainingTotal(
      {
        amount: -50000,
        startDate: "2026-01-01",
        endDate: null,
        dayOfMonth: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "after_count",
        occurrenceCount: 6,
      },
      "2026-01-01",
    );
    expect(total).toBe(300000);
  });

  it("excludes already-elapsed occurrences from an after_count total", () => {
    const total = remainingTotal(
      {
        amount: -50000,
        startDate: "2026-01-01",
        endDate: null,
        dayOfMonth: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "after_count",
        occurrenceCount: 6,
      },
      "2026-04-01",
    );
    // 6 total, 3 elapsed (Jan/Feb/Mar) - 3 remain (Apr/May/Jun).
    expect(total).toBe(150000);
  });

  it("returns null for a never-ending item (no finite total)", () => {
    const total = remainingTotal(
      {
        amount: -100000,
        startDate: "2026-01-01",
        endDate: null,
        dayOfMonth: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "never",
      },
      "2026-01-01",
    );
    expect(total).toBeNull();
  });

  it("resolves an nth-weekday (ordinal) item's remaining total", () => {
    // 3rd Tuesday of each month, ending after Mar 2026.
    const total = remainingTotal(
      {
        amount: -75000,
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        dayOfMonth: null,
        interval: 1,
        unit: "month",
        ordinal: 3,
        ordinalWeekday: 2,
        endsType: "on_date",
      },
      "2026-01-01",
    );
    // Jan 20, Feb 17, Mar 17 (verified in recurrence.test.ts).
    expect(total).toBe(225000);
  });
});

describe("ruleEndDate", () => {
  it("legacy path: returns the item's own end_date", () => {
    expect(ruleEndDate({ startDate: "2026-01-01", endDate: "2026-06-30" })).toBe("2026-06-30");
  });

  it("on_date: returns end_date directly, without needing 'today'", () => {
    expect(
      ruleEndDate({
        startDate: "2026-01-01",
        endDate: "2027-03-15",
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "on_date",
      }),
    ).toBe("2027-03-15");
  });

  it("after_count: resolves the Nth occurrence's actual date", () => {
    expect(
      ruleEndDate({
        startDate: "2026-01-01",
        endDate: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "after_count",
        occurrenceCount: 6,
      }),
    ).toBe("2026-06-01");
  });

  it("after_count: still resolves the completion date even if it's already in the past", () => {
    // 3 monthly payments starting 2020-01-01 - all long finished by any
    // realistic "today", but the completion date itself is fixed regardless.
    expect(
      ruleEndDate({
        startDate: "2020-01-01",
        endDate: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "after_count",
        occurrenceCount: 3,
      }),
    ).toBe("2020-03-01");
  });

  it("never: has no terminal date", () => {
    expect(
      ruleEndDate({
        startDate: "2026-01-01",
        endDate: null,
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
        endsType: "never",
      }),
    ).toBeNull();
  });
});
