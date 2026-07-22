import { describe, expect, it } from "vitest";
import { generateForecast } from "./forecast";
import type {
  Budget,
  BudgetEntry,
  BudgetOccurrenceOverride,
  OneOffItem,
  OccurrenceOverride,
  RecurringItem,
} from "./types";

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

describe("generateForecast budgets", () => {
  it("merges budget rows into the sorted list, type 'budget', unaffected by overrides", () => {
    const groceries: Budget = {
      id: "budget-1",
      name: "Groceries",
      monthlyAllocation: 500000,
      allocation: 500000,
      carryoverEnabled: true,
      createdAt: "2026-01-01",
      linkedIncomeId: null,
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
    };
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-01", amount: 200000, note: null },
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

  it("threads recurringItems/overrides through to a linked-income budget's cycle boundaries (T39)", () => {
    // Before T39, generateForecast called the old monthly-only budgets.ts
    // expansion, which never received recurringItems/overrides at all - a
    // linked-income budget's cycle boundary couldn't respect a moved
    // occurrence. Here the income's Feb 5th occurrence is moved to Feb 10th;
    // an entry logged Feb 8th (between the two dates) must land in the
    // cycle that ends at the *moved* boundary, not the raw one.
    const income = monthlyItem({
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 400000,
      daysOfMonth: [5],
    });
    const overrides: OccurrenceOverride[] = [
      {
        id: "ov1",
        recurringItemId: "income-1",
        originalDate: "2026-02-05",
        newDate: "2026-02-10",
        newAmount: null,
        newName: null,
        skipped: false,
      },
    ];
    const groceries: Budget = {
      id: "budget-1",
      name: "Groceries",
      monthlyAllocation: 500000,
      allocation: 500000,
      carryoverEnabled: false,
      createdAt: "2026-01-01",
      linkedIncomeId: "income-1",
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
    };
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-02-08", amount: 100000, note: null },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [income],
      overrides,
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-02-15",
      horizon: "2026-03-31",
    });

    expect(
      result.map((row) => ({ sourceType: row.sourceType, type: row.type, dueDate: row.dueDate, amount: row.amount })),
    ).toEqual([
      // Feb 8th entry counted against the prior cycle (ending at the moved
      // Feb 10th boundary), so the current cycle's remaining is the full
      // allocation, not allocation-minus-100000.
      { sourceType: "budget", type: "budget", dueDate: "2026-02-15", amount: -500000 },
      { sourceType: "recurring", type: "income", dueDate: "2026-03-05", amount: 400000 },
      { sourceType: "budget", type: "budget", dueDate: "2026-03-05", amount: -500000 },
    ]);
  });
});

describe("generateForecast budget occurrence overrides (T42 part B)", () => {
  const groceries: Budget = {
    id: "budget-1",
    name: "Groceries",
    monthlyAllocation: 500000,
    allocation: 500000,
    carryoverEnabled: false,
    createdAt: "2026-01-01",
    linkedIncomeId: null,
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
  };

  it("moves a future boundary row's date and amount", () => {
    const budgetOverrides: BudgetOccurrenceOverride[] = [
      { id: "bo1", budgetId: "budget-1", originalDate: "2026-02-01", newDate: "2026-02-05", newAmount: -450000, skipped: false },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: [],
      budgetOverrides,
      today: "2026-01-15",
      horizon: "2026-03-31",
    });

    expect(result.map((row) => ({ originalDate: row.originalDate, dueDate: row.dueDate, amount: row.amount }))).toEqual([
      { originalDate: "2026-01-15", dueDate: "2026-01-15", amount: -500000 }, // remaining this cycle, unaffected
      { originalDate: "2026-02-01", dueDate: "2026-02-05", amount: -450000 }, // moved
      { originalDate: "2026-03-01", dueDate: "2026-03-01", amount: -500000 }, // untouched
    ]);
  });

  it("omits a skipped future boundary row entirely", () => {
    const budgetOverrides: BudgetOccurrenceOverride[] = [
      { id: "bo1", budgetId: "budget-1", originalDate: "2026-03-01", newDate: null, newAmount: null, skipped: true },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: [],
      budgetOverrides,
      today: "2026-01-15",
      horizon: "2026-03-31",
    });

    expect(result.map((row) => row.dueDate)).toEqual(["2026-01-15", "2026-02-01"]);
  });

  it("never applies to the 'remaining this cycle' row, even with an override dated exactly today", () => {
    // The "remaining this cycle" row is always dated `today`, never
    // `> today`, so it's structurally excluded from the override lookup -
    // this override should be completely inert.
    const budgetOverrides: BudgetOccurrenceOverride[] = [
      { id: "bo1", budgetId: "budget-1", originalDate: "2026-01-15", newDate: "2026-01-20", newAmount: -999999, skipped: false },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: [],
      budgetOverrides,
      today: "2026-01-15",
      horizon: "2026-01-31",
    });

    expect(result).toEqual([
      expect.objectContaining({ dueDate: "2026-01-15", amount: -500000 }),
    ]);
  });
});

describe("generateForecast future-dated budget entries (T43)", () => {
  const groceries: Budget = {
    id: "budget-1",
    name: "Groceries",
    monthlyAllocation: 500000,
    allocation: 500000,
    carryoverEnabled: false,
    createdAt: "2026-01-01",
    linkedIncomeId: null,
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
  };

  it("renders a future entry as its own editable row without double-counting the balance impact", () => {
    const entries: BudgetEntry[] = [
      { id: "e1", budgetId: "budget-1", entryDate: "2026-01-25", amount: 50000, note: "early groceries" },
    ];

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [groceries],
      budgetEntries: entries,
      today: "2026-01-15",
      horizon: "2026-01-31", // no future boundary rows - isolates this case
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: "budget",
        dueDate: "2026-01-15",
        amount: -400000, // 500000 allocation - 50000 already accounted for via the entry row below
      }),
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
    // The two rows together still total the true remaining (450000), not
    // double-counted.
    expect(result[0].amount + result[1].amount).toBe(-450000);
  });

  it("falls back to just the budget name when the entry has no note", () => {
    const entries: BudgetEntry[] = [{ id: "e1", budgetId: "budget-1", entryDate: "2026-01-25", amount: 50000, note: null }];

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

  it("reduces a future cycle's allocation row while the entry still appears as its own row that cycle", () => {
    const entries: BudgetEntry[] = [{ id: "e2", budgetId: "budget-1", entryDate: "2026-02-10", amount: 200000, note: null }];

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
      { sourceType: "budget", dueDate: "2026-01-15", amount: -500000 }, // nothing spent in Jan yet
      { sourceType: "budget", dueDate: "2026-02-01", amount: -300000 }, // 500000 - 200000 known future spend
      { sourceType: "budget_entry", dueDate: "2026-02-10", amount: -200000 },
      { sourceType: "budget", dueDate: "2026-03-01", amount: -500000 }, // untouched
    ]);
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
