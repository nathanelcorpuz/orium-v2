import { describe, expect, it } from "vitest";
import { generateForecast } from "./forecast";
import type { Budget, BudgetEntry, OneOffItem, OccurrenceOverride, RecurringItem } from "./types";

const today = "2026-01-01";
const horizon = "2026-03-31";

// Shared defaults for a plain monthly-on-day-N item, so each test only
// specifies what it's testing.
function monthlyItem(overrides: Partial<RecurringItem>): RecurringItem {
  return {
    id: "item-1",
    name: "Item",
    type: "bill",
    amount: -100000,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    ordinal: null,
    ordinalWeekday: null,
    endsType: "on_date",
    occurrenceCount: null,
    ...overrides,
  };
}

// Phase 10 (T57) + Phase 11 (T58): id/name/allocation/linkedIncomeId/
// createdAt plus the optional own-replenish-schedule fields (null by
// default - most tests don't need a schedule) - see budgetLedger.ts.
function testBudget(overrides: Partial<Budget>): Budget {
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

describe("generateForecast overrides", () => {
  const electricBill = monthlyItem({
    id: "bill-1",
    name: "Electric",
    amount: -150000,
    daysOfMonth: [10],
  });

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
        edited: true,
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
        edited: true,
      },
    ]);
  });
});

describe("generateForecast edited flag (Phase 7 edited-occurrence indicator)", () => {
  const electricBill = monthlyItem({
    id: "bill-1",
    name: "Electric",
    amount: -150000,
    daysOfMonth: [10],
  });

  it("marks a recurring row edited when a non-skipped override applies, and leaves untouched rows unmarked", () => {
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
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [electricBill],
      overrides,
      oneOffs: [],
      today,
      horizon,
    });

    expect(result.map((row) => ({ dueDate: row.dueDate, edited: row.edited }))).toEqual([
      { dueDate: "2026-01-12", edited: true },
      { dueDate: "2026-02-10", edited: undefined },
      { dueDate: "2026-03-10", edited: undefined },
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
    const bill = monthlyItem({ id: "bill-2", name: "Rent", type: "bill", amount: -300000, daysOfMonth: [20] });
    const income = monthlyItem({
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 400000,
      daysOfMonth: [5],
    });
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

describe("generateForecast budgets (Phase 10 running ledger, T57)", () => {
  it("merges a future-dated outgoing entry into the sorted list as its own row", () => {
    const groceries = testBudget({});
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-10", amount: 200000, note: "weekly run", direction: "outgoing" },
    ];
    const income = monthlyItem({
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 400000,
      daysOfMonth: [5],
    });

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
      result.map((row) => ({ sourceType: row.sourceType, type: row.type, dueDate: row.dueDate, amount: row.amount })),
    ).toEqual([
      { sourceType: "recurring", type: "income", dueDate: "2026-01-05", amount: 400000 },
      { sourceType: "budget_entry", type: "budget", dueDate: "2026-01-10", amount: -200000 },
      { sourceType: "recurring", type: "income", dueDate: "2026-02-05", amount: 400000 },
    ]);
  });

  it("excludes an entry dated today or earlier - only future entries reach the forecast", () => {
    const groceries = testBudget({});
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-01", amount: 200000, note: null, direction: "outgoing" }, // today
      { id: "e2", budgetId: "budget-1", entryDate: "2025-12-20", amount: 100000, note: null, direction: "outgoing" }, // past
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-01",
      horizon: "2026-02-28",
    });

    expect(result).toEqual([]);
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

describe("generateForecast budget replenish schedule (Phase 11, T59)", () => {
  const weeklyMonday = {
    startDate: "2026-01-05",
    interval: 1,
    unit: "week" as const,
    weekdays: [1],
    endsType: "never" as const,
  };

  it("projects a deduction row for an own-schedule ('replenish every') budget", () => {
    const weeklyBudget = testBudget(weeklyMonday);

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [weeklyBudget],
      budgetEntries: [],
      today: "2026-01-01",
      horizon: "2026-01-20",
    });

    expect(
      result.map((row) => ({
        sourceType: row.sourceType,
        dueDate: row.dueDate,
        amount: row.amount,
        budgetSettleable: row.budgetSettleable,
      })),
    ).toEqual([
      { sourceType: "budget_replenish", dueDate: "2026-01-05", amount: -500000, budgetSettleable: true },
      { sourceType: "budget_replenish", dueDate: "2026-01-12", amount: -500000, budgetSettleable: true },
      { sourceType: "budget_replenish", dueDate: "2026-01-19", amount: -500000, budgetSettleable: true },
    ]);
  });

  it("projects an income-linked budget's deduction on its linked income's occurrence dates, not independently settleable", () => {
    const income = monthlyItem({ id: "income-1", type: "income", amount: 2000000, daysOfMonth: [5] });
    const linkedBudget = testBudget({ linkedIncomeId: "income-1" });

    const result = generateForecast({
      balances: [],
      recurringItems: [income],
      overrides: [],
      oneOffs: [],
      budgets: [linkedBudget],
      budgetEntries: [],
      today: "2026-01-01",
      horizon: "2026-02-28",
    });

    const replenishRows = result.filter((row) => row.sourceType === "budget_replenish");
    expect(
      replenishRows.map((row) => ({ dueDate: row.dueDate, amount: row.amount, budgetSettleable: row.budgetSettleable })),
    ).toEqual([
      { dueDate: "2026-01-05", amount: -500000, budgetSettleable: undefined },
      { dueDate: "2026-02-05", amount: -500000, budgetSettleable: undefined },
    ]);
  });

  it("moves the linked budget's deduction along with a moved income occurrence, keyed by the original date", () => {
    const income = monthlyItem({ id: "income-1", type: "income", amount: 2000000, daysOfMonth: [5] });
    const linkedBudget = testBudget({ linkedIncomeId: "income-1" });
    const moved: OccurrenceOverride = {
      id: "ov-1",
      recurringItemId: "income-1",
      originalDate: "2026-01-05",
      newDate: "2026-01-07",
      newAmount: null,
      newName: null,
      skipped: false,
    };

    const result = generateForecast({
      balances: [],
      recurringItems: [income],
      overrides: [moved],
      oneOffs: [],
      budgets: [linkedBudget],
      budgetEntries: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    const replenishRow = result.find((row) => row.sourceType === "budget_replenish");
    expect(replenishRow?.dueDate).toBe("2026-01-07");
    expect(replenishRow?.originalDate).toBe("2026-01-05");
  });

  it("produces no deduction when the linked income's occurrence is skipped", () => {
    const income = monthlyItem({ id: "income-1", type: "income", amount: 2000000, daysOfMonth: [5] });
    const linkedBudget = testBudget({ linkedIncomeId: "income-1" });
    const skip: OccurrenceOverride = {
      id: "ov-1",
      recurringItemId: "income-1",
      originalDate: "2026-01-05",
      newDate: null,
      newAmount: null,
      newName: null,
      skipped: true,
    };

    const result = generateForecast({
      balances: [],
      recurringItems: [income],
      overrides: [skip],
      oneOffs: [],
      budgets: [linkedBudget],
      budgetEntries: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.some((row) => row.sourceType === "budget_replenish")).toBe(false);
  });

  it("suppresses an occurrence already marked settled/skipped in budget_replenish_overrides", () => {
    const weeklyBudget = testBudget(weeklyMonday);

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [weeklyBudget],
      budgetEntries: [],
      budgetReplenishOverrides: [{ id: "bro-1", budgetId: "budget-1", originalDate: "2026-01-05", skipped: true }],
      today: "2026-01-01",
      horizon: "2026-01-20",
    });

    expect(result.map((row) => row.dueDate)).toEqual(["2026-01-12", "2026-01-19"]);
  });

  it("reduces the running balance by the projected deduction, same as any other row", () => {
    const weeklyBudget = testBudget(weeklyMonday);

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [weeklyBudget],
      budgetEntries: [],
      today: "2026-01-01",
      horizon: "2026-01-05",
    });

    expect(result).toEqual([
      expect.objectContaining({ dueDate: "2026-01-05", amount: -500000, runningBalance: 500000 }),
    ]);
  });
});

describe("generateForecast future-dated budget entries (T43, simplified by T57)", () => {
  const groceries = testBudget({});

  it("renders a future entry as its own editable row named '{budget} - {note}'", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-25", amount: 50000, note: "early groceries", direction: "outgoing" },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-15",
      horizon: "2026-01-31",
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: "budget_entry",
        sourceId: "e1",
        dueDate: "2026-01-25",
        name: "Groceries - early groceries",
        amount: -50000,
        type: "budget",
        budgetId: "budget-1",
        budgetName: "Groceries",
        note: "early groceries",
      }),
    ]);
  });

  it("falls back to just the budget name when the entry has no note", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-25", amount: 50000, note: null, direction: "outgoing" },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-15",
      horizon: "2026-01-31",
    });

    expect(result.find((row) => row.sourceType === "budget_entry")?.name).toBe("Groceries");
  });

  it("renders each future entry independently across different dates, sorted with everything else", () => {
    const entries: BudgetEntry[] = [
      { id: "e2", budgetId: "budget-1", entryDate: "2026-02-10", amount: 200000, note: null, direction: "outgoing" },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-15",
      horizon: "2026-03-31",
    });

    expect(result.map((row) => ({ sourceType: row.sourceType, dueDate: row.dueDate, amount: row.amount }))).toEqual([
      { sourceType: "budget_entry", dueDate: "2026-02-10", amount: -200000 },
    ]);
  });

  it("renders a future incoming entry (e.g. a replenishment - SPEC.md T56) as a positive row, not negated", () => {
    const entries: BudgetEntry[] = [
      { id: "e3", budgetId: "budget-1", entryDate: "2026-01-25", amount: 500000, note: "Replenished from Salary", direction: "incoming" },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-15",
      horizon: "2026-01-31",
    });

    expect(result).toEqual([expect.objectContaining({ sourceType: "budget_entry", dueDate: "2026-01-25", amount: 500000 })]);
  });
});

describe("generateForecast start/end date bounds", () => {
  it("delays occurrences until start_date and cuts them off at end_date through the full pipeline", () => {
    const item = monthlyItem({
      id: "bill-3",
      name: "Short-lived bill",
      amount: -100000,
      daysOfMonth: [15],
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

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
