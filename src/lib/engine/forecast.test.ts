import { describe, expect, it } from "vitest";
import { generateForecast } from "./forecast";
import type { Budget, BudgetEntry, OneOffItem, OccurrenceOverride, RecurringItem } from "./types";

const today = "2026-01-01";
const horizon = "2026-03-31";

describe("generateForecast overrides", () => {
  const electricBill: RecurringItem = {
    id: "bill-1",
    name: "Electric",
    type: "bill",
    amount: -150000,
    frequency: "monthly",
    dayOfMonth: 10,
    weekday: null,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  };

  it("moves a date, changes an amount/name, and skips an occurrence", () => {
    const overrides: OccurrenceOverride[] = [
      {
        id: "ov-1",
        recurringItemId: "bill-1",
        originalDate: "2026-01-10",
        newDate: "2026-01-12",
        newAmount: null,
        newName: null,
        skipped: false,
      },
      {
        id: "ov-2",
        recurringItemId: "bill-1",
        originalDate: "2026-02-10",
        newDate: null,
        newAmount: -200000,
        newName: "Electric (adjusted)",
        skipped: false,
      },
      {
        id: "ov-3",
        recurringItemId: "bill-1",
        originalDate: "2026-03-10",
        newDate: null,
        newAmount: null,
        newName: null,
        skipped: true,
      },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [electricBill],
      overrides,
      oneOffs: [],
      today,
      horizon,
    });

    expect(result).toEqual([
      {
        sourceType: "recurring",
        sourceId: "bill-1",
        originalDate: "2026-01-10",
        name: "Electric",
        amount: -150000,
        dueDate: "2026-01-12",
        type: "bill",
        runningBalance: -150000,
      },
      {
        sourceType: "recurring",
        sourceId: "bill-1",
        originalDate: "2026-02-10",
        name: "Electric (adjusted)",
        amount: -200000,
        dueDate: "2026-02-10",
        type: "bill",
        runningBalance: -350000,
      },
    ]);
  });
});

describe("generateForecast one-offs", () => {
  it("merges one-offs due today or later and drops ones before today", () => {
    const oneOffs: OneOffItem[] = [
      { id: "off-1", name: "Gift", amount: 50000, dueDate: "2026-01-05" },
      { id: "off-2", name: "Old refund", amount: 20000, dueDate: "2025-12-31" },
    ];

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [],
      overrides: [],
      oneOffs,
      today,
      horizon,
    });

    expect(result).toEqual([
      {
        sourceType: "one_off",
        sourceId: "off-1",
        originalDate: "2026-01-05",
        name: "Gift",
        amount: 50000,
        dueDate: "2026-01-05",
        type: "extra",
        runningBalance: 1050000,
      },
    ]);
  });
});

describe("generateForecast running balance", () => {
  it("computes a stable-sorted cumulative balance across recurring items and one-offs", () => {
    const bill: RecurringItem = {
      id: "bill-2",
      name: "Rent",
      type: "bill",
      amount: -300000,
      frequency: "monthly",
      dayOfMonth: 20,
      weekday: null,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const income: RecurringItem = {
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 400000,
      frequency: "monthly",
      dayOfMonth: 5,
      weekday: null,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const oneOffs: OneOffItem[] = [
      { id: "off-x", name: "Refund", amount: 100000, dueDate: "2026-01-10" },
    ];

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 750000 }],
      recurringItems: [bill, income],
      overrides: [],
      oneOffs,
      today,
      horizon,
    });

    expect(result.map((row) => ({ dueDate: row.dueDate, amount: row.amount, runningBalance: row.runningBalance }))).toEqual([
      { dueDate: "2026-01-05", amount: 400000, runningBalance: 1150000 },
      { dueDate: "2026-01-10", amount: 100000, runningBalance: 1250000 },
      { dueDate: "2026-01-20", amount: -300000, runningBalance: 950000 },
      { dueDate: "2026-02-05", amount: 400000, runningBalance: 1350000 },
      { dueDate: "2026-02-20", amount: -300000, runningBalance: 1050000 },
      { dueDate: "2026-03-05", amount: 400000, runningBalance: 1450000 },
      { dueDate: "2026-03-20", amount: -300000, runningBalance: 1150000 },
    ]);
  });
});

describe("generateForecast budgets", () => {
  it("merges budget rows into the sorted list, type 'budget', unaffected by overrides", () => {
    const groceries: Budget = { id: "budget-1", name: "Groceries", monthlyAllocation: 500000 };
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-01", amount: 200000, note: null },
    ];
    const income: RecurringItem = {
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 400000,
      frequency: "monthly",
      dayOfMonth: 5,
      weekday: null,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [income],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-01",
      horizon: "2026-02-28",
    });

    expect(
      result.map((row) => ({
        sourceType: row.sourceType,
        type: row.type,
        dueDate: row.dueDate,
        amount: row.amount,
      })),
    ).toEqual([
      { sourceType: "budget", type: "budget", dueDate: "2026-01-01", amount: -300000 },
      { sourceType: "recurring", type: "income", dueDate: "2026-01-05", amount: 400000 },
      { sourceType: "budget", type: "budget", dueDate: "2026-02-01", amount: -500000 },
      { sourceType: "recurring", type: "income", dueDate: "2026-02-05", amount: 400000 },
    ]);
  });

  it("defaults to no budget rows when budgets/budgetEntries are omitted", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-02-28",
    });

    expect(result).toEqual([]);
  });
});

describe("generateForecast start/end date bounds", () => {
  it("delays occurrences until start_date and cuts them off at end_date through the full pipeline", () => {
    const item: RecurringItem = {
      id: "bill-3",
      name: "Short-lived bill",
      type: "bill",
      amount: -100000,
      frequency: "monthly",
      dayOfMonth: 15,
      weekday: null,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    };

    const result = generateForecast({
      balances: [],
      recurringItems: [item],
      overrides: [],
      oneOffs: [],
      today,
      horizon,
    });

    expect(result.map((row) => row.dueDate)).toEqual(["2026-02-15"]);
  });
});
