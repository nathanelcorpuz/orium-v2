import { describe, expect, it } from "vitest";
import { currentMonthBudgetStatus, expandBudgetOccurrences } from "./budgets";
import type { BudgetEntry } from "./types";

const foodBudget = { id: "budget-1", monthlyAllocation: 500000 }; // ₱5,000

describe("currentMonthBudgetStatus", () => {
  it("computes remaining mid-month with a partial spend", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-10", amount: 200000, note: null },
    ];

    expect(currentMonthBudgetStatus(foodBudget, entries, "2026-01-15")).toEqual({
      remaining: 300000,
      overBy: 0,
    });
  });

  it("clamps remaining to 0 and reports overBy when spends exceed the allocation", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-05", amount: 400000, note: null },
      { id: "e2", budgetId: "budget-1", entryDate: "2026-01-20", amount: 200000, note: null },
    ];

    expect(currentMonthBudgetStatus(foodBudget, entries, "2026-01-25")).toEqual({
      remaining: 0,
      overBy: 100000,
    });
  });

  it("ignores entries from other months (month boundary reset)", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2025-12-31", amount: 450000, note: null },
      { id: "e2", budgetId: "budget-1", entryDate: "2026-02-01", amount: 450000, note: null },
    ];

    expect(currentMonthBudgetStatus(foodBudget, entries, "2026-01-15")).toEqual({
      remaining: 500000,
      overBy: 0,
    });
  });

  it("ignores entries belonging to a different budget", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-2", entryDate: "2026-01-10", amount: 500000, note: null },
    ];

    expect(currentMonthBudgetStatus(foodBudget, entries, "2026-01-15")).toEqual({
      remaining: 500000,
      overBy: 0,
    });
  });

  it("stays integer centavos", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-10", amount: 133333, note: null },
    ];
    const { remaining } = currentMonthBudgetStatus(foodBudget, entries, "2026-01-15");
    expect(Number.isInteger(remaining)).toBe(true);
    expect(remaining).toBe(366667);
  });
});

describe("expandBudgetOccurrences", () => {
  it("dates the current-month row today, with the remaining amount as a negative outflow", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-05", amount: 200000, note: null },
    ];

    const occurrences = expandBudgetOccurrences(foodBudget, entries, "2026-01-15", "2026-01-15");
    expect(occurrences).toEqual([{ date: "2026-01-15", amount: -300000 }]);
  });

  it("emits a zero-amount current-month row when fully spent (no negative outflow beyond 0)", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-05", amount: 900000, note: null },
    ];

    const occurrences = expandBudgetOccurrences(foodBudget, entries, "2026-01-15", "2026-01-15");
    expect(occurrences).toEqual([{ date: "2026-01-15", amount: 0 }]);
  });

  it("emits one row per future month, dated the 1st, at the full allocation", () => {
    const occurrences = expandBudgetOccurrences(foodBudget, [], "2026-01-15", "2026-04-30");

    expect(occurrences).toEqual([
      { date: "2026-01-15", amount: -500000 },
      { date: "2026-02-01", amount: -500000 },
      { date: "2026-03-01", amount: -500000 },
      { date: "2026-04-01", amount: -500000 },
    ]);
  });

  it("never rolls over an underspend from a past month into a future month's allocation", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-05", amount: 500000, note: null },
    ];

    const occurrences = expandBudgetOccurrences(foodBudget, entries, "2026-01-15", "2026-02-28");
    expect(occurrences).toEqual([
      { date: "2026-01-15", amount: 0 },
      { date: "2026-02-01", amount: -500000 },
    ]);
  });

  it("stops generating future months once the horizon is passed", () => {
    const occurrences = expandBudgetOccurrences(foodBudget, [], "2026-12-15", "2027-02-28");

    expect(occurrences).toEqual([
      { date: "2026-12-15", amount: -500000 },
      { date: "2027-01-01", amount: -500000 },
      { date: "2027-02-01", amount: -500000 },
    ]);
  });
});
