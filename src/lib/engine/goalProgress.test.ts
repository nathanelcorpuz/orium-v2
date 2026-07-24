import { describe, expect, it } from "vitest";
import { goalProgress } from "./goalProgress";
import type { RecurrenceRule } from "./types";

// Shared defaults so each test only overrides what it's testing, matching
// the pattern in remaining.test.ts/recurrence.test.ts.
function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    startDate: "2026-01-01",
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    ordinal: null,
    ordinalWeekday: null,
    endsType: "on_date",
    endDate: "2026-12-31",
    occurrenceCount: null,
    ...overrides,
  };
}

describe("goalProgress", () => {
  it("computes settled/total for an on_date rule", () => {
    // Monthly on the 1st, Jan-Dec 2026 = 12 occurrences.
    const progress = goalProgress(rule({}), 5);
    expect(progress).toEqual({ total: 12, settled: 5, fraction: 5 / 12 });
  });

  it("computes settled/total for an after_count rule", () => {
    const progress = goalProgress(
      rule({ endsType: "after_count", endDate: null, occurrenceCount: 6 }),
      3,
    );
    expect(progress).toEqual({ total: 6, settled: 3, fraction: 0.5 });
  });

  it("returns fraction 0 when nothing has been settled yet", () => {
    const progress = goalProgress(rule({ endsType: "after_count", endDate: null, occurrenceCount: 4 }), 0);
    expect(progress).toEqual({ total: 4, settled: 0, fraction: 0 });
  });

  it("returns fraction 1 when every occurrence has been settled", () => {
    const progress = goalProgress(rule({ endsType: "after_count", endDate: null, occurrenceCount: 4 }), 4);
    expect(progress).toEqual({ total: 4, settled: 4, fraction: 1 });
  });

  it("clamps settled to total if a rule was edited shorter after some occurrences were already settled", () => {
    const progress = goalProgress(rule({ endsType: "after_count", endDate: null, occurrenceCount: 4 }), 9);
    expect(progress).toEqual({ total: 4, settled: 4, fraction: 1 });
  });

  it("resolves a weekly rule's total the same way expandRecurrenceOccurrences does", () => {
    // Mondays from Jan 5 through Jan 26, 2026 = 4 occurrences.
    const progress = goalProgress(
      rule({
        startDate: "2026-01-05",
        endDate: "2026-01-26",
        unit: "week",
        weekdays: [1],
        daysOfMonth: null,
      }),
      2,
    );
    expect(progress).toEqual({ total: 4, settled: 2, fraction: 0.5 });
  });
});
