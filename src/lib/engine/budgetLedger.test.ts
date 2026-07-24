import { describe, expect, it } from "vitest";
import {
  budgetProgressFraction,
  budgetReplenishRule,
  computeBudgetBalance,
  futureBudgetLedgerEntries,
  futureBudgetReplenishDates,
  replenishProgress,
} from "./budgetLedger";
import type { Budget, BudgetEntry, RecurringItem } from "./types";

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

// Phase 11 (SPEC.md T58): a budget's replenish schedule - its own
// ("replenish every"), or its linked income's - and the "days until
// replenish" / progress-bar math derived from it.

function budget(overrides: Partial<Budget>): Budget {
  return {
    id: "budget-1",
    name: "Groceries",
    allocation: 500000,
    linkedIncomeId: null,
    createdAt: "2026-01-01",
    startDate: null,
    interval: null,
    unit: null,
    weekdays: null,
    daysOfMonth: null,
    ordinal: null,
    ordinalWeekday: null,
    endsType: null,
    endDate: null,
    occurrenceCount: null,
    ...overrides,
  };
}

// Weekly on Mondays, starting 2026-01-05 (a Monday): 2026-01-05, 01-12, 01-19, 01-26, ...
const weeklyMonday = {
  startDate: "2026-01-05",
  interval: 1,
  unit: "week" as const,
  weekdays: [1],
  daysOfMonth: null,
  ordinal: null,
  ordinalWeekday: null,
  endsType: "never" as const,
  endDate: null,
  occurrenceCount: null,
};

function income(overrides: Partial<RecurringItem>): RecurringItem {
  return {
    id: "income-1",
    name: "Freelance",
    type: "income",
    amount: 2000000,
    ...weeklyMonday,
    ...overrides,
  };
}

describe("budgetReplenishRule", () => {
  it("returns null for a manual budget (no own schedule, no linked income)", () => {
    expect(budgetReplenishRule(budget({}), null)).toBeNull();
  });

  it("returns the budget's own rule when it has one", () => {
    const rule = budgetReplenishRule(budget({ ...weeklyMonday }), null);
    expect(rule).toEqual({
      startDate: "2026-01-05",
      interval: 1,
      unit: "week",
      weekdays: [1],
      daysOfMonth: null,
      ordinal: null,
      ordinalWeekday: null,
      endsType: "never",
      endDate: null,
      occurrenceCount: null,
    });
  });

  it("returns the linked income's rule for an income-linked budget", () => {
    const linkedIncome = income({ startDate: "2026-02-02", weekdays: [2] });
    const rule = budgetReplenishRule(budget({ linkedIncomeId: "income-1" }), linkedIncome);
    expect(rule).toEqual(
      expect.objectContaining({ startDate: "2026-02-02", unit: "week", weekdays: [2] }),
    );
  });

  it("returns null for an income-linked budget when the income isn't provided", () => {
    expect(budgetReplenishRule(budget({ linkedIncomeId: "income-1" }), null)).toBeNull();
  });
});

describe("futureBudgetReplenishDates", () => {
  it("returns [] when the rule is null", () => {
    expect(futureBudgetReplenishDates(null, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("delegates to expandRecurrenceOccurrences for a resolved rule", () => {
    expect(futureBudgetReplenishDates(weeklyMonday, "2026-01-01", "2026-01-20")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });
});

describe("replenishProgress", () => {
  it("returns all-null for a manual budget (null rule)", () => {
    expect(replenishProgress(null, "2026-01-10")).toEqual({
      previousDate: null,
      nextDate: null,
      daysUntil: null,
      fraction: null,
    });
  });

  it("computes previous/next/daysUntil/fraction mid-period", () => {
    // asOf 2026-01-10 sits between 2026-01-05 (previous Monday) and
    // 2026-01-12 (next Monday) - 5 of the 7 days elapsed.
    const result = replenishProgress(weeklyMonday, "2026-01-10");
    expect(result.previousDate).toBe("2026-01-05");
    expect(result.nextDate).toBe("2026-01-12");
    expect(result.daysUntil).toBe(2);
    expect(result.fraction).toBeCloseTo(5 / 7);
  });

  it("treats asOf landing exactly on a replenish day as fully elapsed", () => {
    const result = replenishProgress(weeklyMonday, "2026-01-05");
    expect(result).toEqual({ previousDate: "2026-01-05", nextDate: "2026-01-05", daysUntil: 0, fraction: 1 });
  });

  it("has no previousDate (and null fraction) before the rule's first occurrence", () => {
    const result = replenishProgress(weeklyMonday, "2026-01-01");
    expect(result.previousDate).toBeNull();
    expect(result.nextDate).toBe("2026-01-05");
    expect(result.daysUntil).toBe(4);
    expect(result.fraction).toBeNull();
  });

  it("has no nextDate (and null daysUntil/fraction) once an on_date rule has run out", () => {
    const endedRule = { ...weeklyMonday, endsType: "on_date" as const, endDate: "2026-01-19" };
    const result = replenishProgress(endedRule, "2026-01-25");
    expect(result.previousDate).toBe("2026-01-19");
    expect(result.nextDate).toBeNull();
    expect(result.daysUntil).toBeNull();
    expect(result.fraction).toBeNull();
  });
});

describe("budgetProgressFraction", () => {
  it("returns null when there's no allocation to measure against", () => {
    expect(
      budgetProgressFraction({
        allocation: 0,
        remaining: 500,
        previousDate: null,
        nextDate: null,
        asOf: "2026-01-10",
      }),
    ).toBeNull();
  });

  describe("manual budget (no replenish schedule) - straight spend ratio", () => {
    it("reads as empty right after a top-up (nothing spent yet)", () => {
      expect(
        budgetProgressFraction({
          allocation: 900000,
          remaining: 900000,
          previousDate: null,
          nextDate: null,
          asOf: "2026-01-10",
        }),
      ).toBe(0);
    });

    it("reads as full once fully spent", () => {
      expect(
        budgetProgressFraction({
          allocation: 900000,
          remaining: 0,
          previousDate: null,
          nextDate: null,
          asOf: "2026-01-10",
        }),
      ).toBe(1);
    });

    it("reads at half once half spent", () => {
      expect(
        budgetProgressFraction({
          allocation: 900000,
          remaining: 450000,
          previousDate: null,
          nextDate: null,
          asOf: "2026-01-10",
        }),
      ).toBeCloseTo(0.5);
    });

    it("clamps to full when overspent (negative remaining)", () => {
      expect(
        budgetProgressFraction({
          allocation: 900000,
          remaining: -50000,
          previousDate: null,
          nextDate: null,
          asOf: "2026-01-10",
        }),
      ).toBe(1);
    });
  });

  describe("scheduled/income-linked budget - pace-adjusted", () => {
    // 7-day period, matching the weeklyMonday fixture above:
    // previous 2026-01-05, next 2026-01-12.
    it("reads as empty at the exact replenish boundary even with money left (the reported scenario)", () => {
      // asOf lands exactly on a replenish day - previousDate === nextDate,
      // a zero-length period - regardless of how much of the allocation is
      // still sitting unspent, there's no time left to be "behind" on.
      expect(
        budgetProgressFraction({
          allocation: 900000,
          remaining: 900000,
          previousDate: "2026-01-05",
          nextDate: "2026-01-05",
          asOf: "2026-01-05",
        }),
      ).toBe(0);
    });

    it("reads as empty when exactly on pace", () => {
      // 2 of 7 days left; on-pace remaining is also 2/7 of the allocation.
      expect(
        budgetProgressFraction({
          allocation: 700,
          remaining: 200,
          previousDate: "2026-01-05",
          nextDate: "2026-01-12",
          asOf: "2026-01-10",
        }),
      ).toBeCloseTo(0);
    });

    it("fills partway when behind pace (less money left than time left)", () => {
      expect(
        budgetProgressFraction({
          allocation: 700,
          remaining: 100,
          previousDate: "2026-01-05",
          nextDate: "2026-01-12",
          asOf: "2026-01-10",
        }),
      ).toBeCloseTo(0.5);
    });

    it("clamps to empty when ahead of pace (more money left than time left)", () => {
      expect(
        budgetProgressFraction({
          allocation: 700,
          remaining: 400,
          previousDate: "2026-01-05",
          nextDate: "2026-01-12",
          asOf: "2026-01-10",
        }),
      ).toBe(0);
    });
  });
});
