import { describe, expect, it } from "vitest";
import { computeBudgetBalance, futureBudgetLedgerEntries } from "./budgetLedger";
import type { BudgetEntry } from "./types";

function entry(overrides: Partial<BudgetEntry>): BudgetEntry {
  return {
    id: "e1",
    budgetId: "budget-1",
    entryDate: "2026-01-01",
    amount: 0,
    note: null,
    direction: "outgoing",
    ...overrides,
  };
}

describe("computeBudgetBalance", () => {
  it("returns 0 for a budget with no entries", () => {
    expect(computeBudgetBalance([], "budget-1", "2026-01-15")).toBe(0);
  });

  it("adds incoming and subtracts outgoing", () => {
    const entries: BudgetEntry[] = [
      entry({ direction: "incoming", amount: 500000, entryDate: "2026-01-01" }),
      entry({ direction: "outgoing", amount: 200000, entryDate: "2026-01-05" }),
    ];
    expect(computeBudgetBalance(entries, "budget-1", "2026-01-15")).toBe(300000);
  });

  it("goes negative on overspend - no clamping", () => {
    const entries: BudgetEntry[] = [
      entry({ direction: "incoming", amount: 100000, entryDate: "2026-01-01" }),
      entry({ direction: "outgoing", amount: 250000, entryDate: "2026-01-05" }),
    ];
    expect(computeBudgetBalance(entries, "budget-1", "2026-01-15")).toBe(-150000);
  });

  it("excludes entries dated after asOf", () => {
    const entries: BudgetEntry[] = [
      entry({ direction: "incoming", amount: 500000, entryDate: "2026-01-01" }),
      entry({ direction: "outgoing", amount: 200000, entryDate: "2026-01-20" }), // future relative to asOf
    ];
    expect(computeBudgetBalance(entries, "budget-1", "2026-01-15")).toBe(500000);
  });

  it("includes an entry dated exactly asOf", () => {
    const entries: BudgetEntry[] = [entry({ direction: "outgoing", amount: 100000, entryDate: "2026-01-15" })];
    expect(computeBudgetBalance(entries, "budget-1", "2026-01-15")).toBe(-100000);
  });

  it("ignores entries belonging to a different budget", () => {
    const entries: BudgetEntry[] = [
      entry({ budgetId: "budget-1", direction: "incoming", amount: 500000, entryDate: "2026-01-01" }),
      entry({ budgetId: "budget-2", direction: "incoming", amount: 999999, entryDate: "2026-01-01" }),
    ];
    expect(computeBudgetBalance(entries, "budget-1", "2026-01-15")).toBe(500000);
  });
});

describe("futureBudgetLedgerEntries", () => {
  it("returns only this budget's entries dated after today, sorted ascending", () => {
    const entries: BudgetEntry[] = [
      entry({ id: "e1", direction: "outgoing", entryDate: "2026-02-10", amount: 100000 }),
      entry({ id: "e2", direction: "incoming", entryDate: "2026-01-05", amount: 200000 }), // past - excluded
      entry({ id: "e3", direction: "incoming", entryDate: "2026-01-20", amount: 300000 }),
      entry({ id: "e4", budgetId: "other-budget", direction: "outgoing", entryDate: "2026-02-01", amount: 400000 }), // different budget - excluded
    ];
    const result = futureBudgetLedgerEntries(entries, "budget-1", "2026-01-15");
    expect(result.map((e) => e.id)).toEqual(["e3", "e1"]);
  });

  it("returns an empty array when nothing is future-dated", () => {
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-01" })];
    expect(futureBudgetLedgerEntries(entries, "budget-1", "2026-01-15")).toEqual([]);
  });
});
