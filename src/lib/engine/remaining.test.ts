import { describe, expect, it } from "vitest";
import { remainingMonthlyTotal } from "./remaining";

describe("remainingMonthlyTotal", () => {
  it("sums the remaining occurrences through the item's own end_date", () => {
    const total = remainingMonthlyTotal(
      { startDate: "2025-01-15", endDate: "2026-03-15", dayOfMonth: 15, amount: -500000 },
      "2026-01-01",
    );
    // Remaining occurrences from today (2026-01-01) through end_date: Jan 15, Feb 15, Mar 15
    expect(total).toBe(1500000);
  });

  it("excludes occurrences before today, even if the item started in the past", () => {
    const total = remainingMonthlyTotal(
      { startDate: "2020-01-15", endDate: "2026-02-15", dayOfMonth: 15, amount: -100000 },
      "2026-02-01",
    );
    // Only Feb 15 remains
    expect(total).toBe(100000);
  });

  it("returns 0 once the item's end_date has passed", () => {
    const total = remainingMonthlyTotal(
      { startDate: "2024-01-01", endDate: "2025-12-31", dayOfMonth: 1, amount: -200000 },
      "2026-01-01",
    );
    expect(total).toBe(0);
  });

  it("uses the absolute value of amount regardless of sign", () => {
    const total = remainingMonthlyTotal(
      { startDate: "2026-01-01", endDate: "2026-01-31", dayOfMonth: 1, amount: 300000 },
      "2026-01-01",
    );
    expect(total).toBe(300000);
  });
});
