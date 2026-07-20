import { describe, expect, it } from "vitest";
import { computeMonthlyPeaksAndDrops } from "./peaksAndDrops";
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

describe("computeMonthlyPeaksAndDrops", () => {
  it("computes peak and drop for a single month with multiple rows", () => {
    const rows = [row("2026-01-05", 1000), row("2026-01-15", 500), row("2026-01-25", 1500)];
    const result = computeMonthlyPeaksAndDrops(rows, 0, "2026-01-01", "2026-01-31");
    expect(result).toEqual([{ month: "2026-01", peak: 1500, drop: 500 }]);
  });

  it("computes independent peak/drop per month across several months", () => {
    const rows = [
      row("2026-01-05", 1000),
      row("2026-01-15", 200),
      row("2026-02-05", 800),
      row("2026-02-15", 1200),
    ];
    const result = computeMonthlyPeaksAndDrops(rows, 0, "2026-01-01", "2026-02-28");
    expect(result).toEqual([
      { month: "2026-01", peak: 1000, drop: 200 },
      { month: "2026-02", peak: 1200, drop: 800 },
    ]);
  });

  it("carries the prior month's ending balance forward through an empty month", () => {
    const rows = [row("2026-01-10", 500), row("2026-03-10", 700)];
    const result = computeMonthlyPeaksAndDrops(rows, 0, "2026-01-01", "2026-03-31");
    expect(result).toEqual([
      { month: "2026-01", peak: 500, drop: 500 },
      { month: "2026-02", peak: 500, drop: 500 },
      { month: "2026-03", peak: 700, drop: 700 },
    ]);
  });

  it("uses the starting balance for leading empty months before the first occurrence", () => {
    const rows = [row("2026-03-10", 900)];
    const result = computeMonthlyPeaksAndDrops(rows, 250, "2026-01-01", "2026-03-31");
    expect(result).toEqual([
      { month: "2026-01", peak: 250, drop: 250 },
      { month: "2026-02", peak: 250, drop: 250 },
      { month: "2026-03", peak: 900, drop: 900 },
    ]);
  });

  it("carries the final balance forward through trailing empty months up to the horizon", () => {
    const rows = [row("2026-01-10", 400)];
    const result = computeMonthlyPeaksAndDrops(rows, 0, "2026-01-01", "2026-03-31");
    expect(result).toEqual([
      { month: "2026-01", peak: 400, drop: 400 },
      { month: "2026-02", peak: 400, drop: 400 },
      { month: "2026-03", peak: 400, drop: 400 },
    ]);
  });

  it("returns one entry per month even with no rows at all", () => {
    const result = computeMonthlyPeaksAndDrops([], 1000, "2026-11-01", "2027-02-28");
    expect(result).toEqual([
      { month: "2026-11", peak: 1000, drop: 1000 },
      { month: "2026-12", peak: 1000, drop: 1000 },
      { month: "2027-01", peak: 1000, drop: 1000 },
      { month: "2027-02", peak: 1000, drop: 1000 },
    ]);
  });
});
