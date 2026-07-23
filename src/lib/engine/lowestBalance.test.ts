import { describe, expect, it } from "vitest";
import { findLowestBalancePoint } from "./lowestBalance";
import type { ForecastRow } from "./types";

function row(dueDate: string, runningBalance: number): ForecastRow {
  return {
    sourceType: "recurring",
    sourceId: "item-1",
    originalDate: dueDate,
    name: "Test",
    amount: 0,
    dueDate,
    type: "bill",
    runningBalance,
  };
}

describe("findLowestBalancePoint", () => {
  it("returns the starting balance/today when there are no rows", () => {
    expect(findLowestBalancePoint([], 100000, "2026-01-01")).toEqual({
      balance: 100000,
      date: "2026-01-01",
    });
  });

  it("finds the single lowest point across the whole horizon, not just month-by-month", () => {
    const rows = [
      row("2026-01-05", 90000),
      row("2026-03-15", 5000), // the actual lowest, several months later
      row("2026-06-20", 60000),
    ];
    expect(findLowestBalancePoint(rows, 100000, "2026-01-01")).toEqual({
      balance: 5000,
      date: "2026-03-15",
    });
  });

  it("treats the starting balance itself as a candidate when every row nets positive", () => {
    const rows = [row("2026-01-05", 120000), row("2026-02-05", 150000)];
    expect(findLowestBalancePoint(rows, 100000, "2026-01-01")).toEqual({
      balance: 100000,
      date: "2026-01-01",
    });
  });

  it("reports a negative low point correctly", () => {
    const rows = [row("2026-01-05", 50000), row("2026-02-14", -20000), row("2026-03-01", 30000)];
    expect(findLowestBalancePoint(rows, 100000, "2026-01-01")).toEqual({
      balance: -20000,
      date: "2026-02-14",
    });
  });

  it("keeps the earliest date on a tie (strict less-than, not less-than-or-equal)", () => {
    const rows = [row("2026-01-10", 5000), row("2026-05-01", 5000)];
    expect(findLowestBalancePoint(rows, 100000, "2026-01-01")).toEqual({
      balance: 5000,
      date: "2026-01-10",
    });
  });
});
