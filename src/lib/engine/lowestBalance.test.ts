import { describe, expect, it } from "vitest";
import { findFirstDangerPoint, findLowestBalancePoint, findNextTransactionBatch } from "./lowestBalance";
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

describe("findFirstDangerPoint", () => {
  it("returns null when the balance never crosses into danger", () => {
    const rows = [row("2026-01-05", 90000), row("2026-03-15", 5000)];
    expect(findFirstDangerPoint(rows, 100000, 0, "2026-01-01")).toBeNull();
  });

  it("returns the FIRST crossing, not the eventual lowest point", () => {
    // Mirrors the T88 seed scenario: first goes negative on one date, the
    // actual worst point (found separately by findLowestBalancePoint) lands
    // later after oscillating.
    const rows = [
      row("2026-09-01", -2000), // first crossing
      row("2026-09-03", 500),
      row("2026-09-13", -30000), // the eventual lowest point, not this one
      row("2026-11-12", 100),
    ];
    expect(findFirstDangerPoint(rows, 100000, 0, "2026-01-01")).toEqual({
      balance: -2000,
      date: "2026-09-01",
    });
  });

  it("treats the starting balance as a candidate when it's already at/below the threshold", () => {
    const rows = [row("2026-01-05", 50000)];
    expect(findFirstDangerPoint(rows, -1000, 0, "2026-01-01")).toEqual({
      balance: -1000,
      date: "2026-01-01",
    });
  });

  it("uses the given threshold, not a hardcoded zero", () => {
    const rows = [row("2026-01-05", 3000), row("2026-02-01", 500)];
    expect(findFirstDangerPoint(rows, 10000, 1000, "2026-01-01")).toEqual({
      balance: 500,
      date: "2026-02-01",
    });
  });

  it("returns the starting balance/today when there are no rows and it's already in danger", () => {
    expect(findFirstDangerPoint([], -500, 0, "2026-01-01")).toEqual({
      balance: -500,
      date: "2026-01-01",
    });
  });

  it("returns null when there are no rows and the starting balance is fine", () => {
    expect(findFirstDangerPoint([], 500, 0, "2026-01-01")).toBeNull();
  });
});

describe("findNextTransactionBatch (SPEC.md T215)", () => {
  it("returns null when there are no rows", () => {
    expect(findNextTransactionBatch([])).toBeNull();
  });

  it("finds the single earliest date and counts just that one row", () => {
    const rows = [row("2026-01-05", 90000), row("2026-01-12", 80000)];
    expect(findNextTransactionBatch(rows)).toEqual({ date: "2026-01-05", count: 1 });
  });

  it("counts every row sharing the earliest date, e.g. a payday and a bill on the same day", () => {
    const rows = [row("2026-01-05", 90000), row("2026-01-05", 70000), row("2026-01-12", 80000)];
    expect(findNextTransactionBatch(rows)).toEqual({ date: "2026-01-05", count: 2 });
  });

  it("is order-independent - the earliest date wins regardless of array order", () => {
    const rows = [row("2026-03-01", 1000), row("2026-01-05", 90000), row("2026-01-05", 70000)];
    expect(findNextTransactionBatch(rows)).toEqual({ date: "2026-01-05", count: 2 });
  });

  it("excludes hidden rows (T214's auto-move legs) from both the date search and the count", () => {
    const hiddenRow: ForecastRow = { ...row("2026-01-03", 50000), hidden: true };
    const rows = [hiddenRow, row("2026-01-05", 90000)];
    expect(findNextTransactionBatch(rows)).toEqual({ date: "2026-01-05", count: 1 });
  });

  it("excludes fromScenario rows - hypothetical, not a real obligation to settle", () => {
    const scenarioRow: ForecastRow = { ...row("2026-01-02", 50000), fromScenario: true };
    const rows = [scenarioRow, row("2026-01-05", 90000)];
    expect(findNextTransactionBatch(rows)).toEqual({ date: "2026-01-05", count: 1 });
  });

  it("returns null when every row is hidden or from a scenario", () => {
    const rows: ForecastRow[] = [
      { ...row("2026-01-03", 50000), hidden: true },
      { ...row("2026-01-04", 50000), fromScenario: true },
    ];
    expect(findNextTransactionBatch(rows)).toBeNull();
  });
});
