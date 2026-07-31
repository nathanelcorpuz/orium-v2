import { describe, expect, it } from "vitest";
import { generateForecast, splitPastDue } from "./forecast";
import type {
  Budget,
  BudgetEntry,
  BudgetReplenishOverride,
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
    balanceId: null,
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
  // T150 (Bug #11) rewrote this case. It previously asserted that a one-off
  // dated before today was dropped; that behavior is the bug - an unsettled
  // past-dated item is still owed, and dropping it silently restored the
  // running balance as if the money were never leaving.
  it("keeps past-dated one-offs, flagged past-due, ahead of upcoming ones", () => {
    const oneOffs: OneOffItem[] = [
      { id: "off-1", name: "Gift", amount: 50000, dueDate: "2026-01-05", balanceId: null },
      { id: "off-2", name: "Unpaid repair", amount: -20000, dueDate: "2025-12-31", balanceId: null },
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
        sourceId: "off-2",
        originalDate: "2025-12-31",
        name: "Unpaid repair",
        amount: -20000,
        dueDate: "2025-12-31",
        type: "extra",
        runningBalance: 980000,
        pastDue: true,
      },
      {
        sourceType: "one_off",
        sourceId: "off-1",
        originalDate: "2026-01-05",
        name: "Gift",
        amount: 50000,
        dueDate: "2026-01-05",
        type: "extra",
        // The past-due deduction comes off the top, so every later balance
        // carries it: 1,000,000 - 20,000 + 50,000.
        runningBalance: 1030000,
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
      { id: "off-x", name: "Refund", amount: 100000, dueDate: "2026-01-10", balanceId: null },
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

// T154 (SPEC.md Phase 20): coverage for the same-day ordering rule T148
// shipped without. The rule is small but it changes a number the user acts
// on - without it, a salary and a bill landing on the same day could show a
// dip that never really happens, because the bill was deducted first.
describe("generateForecast same-day ordering (T148)", () => {
  const onThe5th = (overrides: Partial<RecurringItem>): RecurringItem =>
    monthlyItem({ daysOfMonth: [5], endDate: "2026-01-31", ...overrides });

  it("puts income before deductions on a shared due date", () => {
    const result = generateForecast({
      balances: [],
      // Deliberately listed bill-first, so insertion order alone would put
      // the deduction ahead of the income if the sort didn't intervene.
      recurringItems: [
        onThe5th({ id: "bill-1", name: "Rent", type: "bill", amount: -3000000 }),
        onThe5th({ id: "income-1", name: "Salary", type: "income", amount: 5000000 }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["Salary", "Rent"]);
    // The point of the rule: the running balance never dips negative, because
    // the money arrives before it goes out.
    expect(result.map((row) => row.runningBalance)).toEqual([5000000, 2000000]);
  });

  it("orders by date first, and only then by sign", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [
        onThe5th({ id: "income-1", name: "Salary", type: "income", amount: 5000000 }),
        monthlyItem({
          id: "bill-1",
          name: "Earlier bill",
          type: "bill",
          amount: -100000,
          daysOfMonth: [3],
          endDate: "2026-01-31",
        }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    // Jan 3's outgoing row still comes before Jan 5's incoming one - the sign
    // rule applies within a date, never across dates.
    expect(result.map((row) => [row.dueDate, row.name])).toEqual([
      ["2026-01-03", "Earlier bill"],
      ["2026-01-05", "Salary"],
    ]);
  });

  it("keeps insertion order for same-day rows with the same sign", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [
        onThe5th({ id: "bill-1", name: "First bill", type: "bill", amount: -100000 }),
        onThe5th({ id: "bill-2", name: "Second bill", type: "bill", amount: -200000 }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["First bill", "Second bill"]);
  });

  it("applies the rule across sources, not just within recurring items", () => {
    const oneOffIncome: OneOffItem = {
      id: "extra-1",
      name: "Refund",
      amount: 400000,
      dueDate: "2026-01-05",
      balanceId: null,
    };

    const result = generateForecast({
      balances: [],
      recurringItems: [onThe5th({ id: "bill-1", name: "Rent", type: "bill", amount: -300000 })],
      overrides: [],
      // One-offs are merged after recurring items, so without the sign rule
      // the refund would land second purely because of merge order.
      oneOffs: [oneOffIncome],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["Refund", "Rent"]);
    expect(result.map((row) => row.runningBalance)).toEqual([400000, 100000]);
  });
});

// T150 (Bug #11, SPEC.md Phase 20): unsettled occurrences whose date has
// passed stay in the forecast and keep counting against the running balance.
// The user hit the real-world version of this: a Jul 29 Misc payment dropped
// out of the forecast on Jul 30, and a genuine Sep 1 negative balance
// disappeared with it, reporting them as solvent when they were not.
describe("generateForecast past-due occurrences (T150)", () => {
  it("keeps unsettled recurring occurrences from before today", () => {
    const rent = monthlyItem({
      id: "bill-rent",
      name: "Rent",
      type: "bill",
      amount: -300000,
      daysOfMonth: [1],
      startDate: "2025-11-01",
      endDate: "2026-02-28",
    });

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [rent],
      overrides: [],
      oneOffs: [],
      today: "2026-01-15",
      horizon: "2026-02-28",
    });

    // Nov 1, Dec 1 and Jan 1 are all in the past and unsettled; Feb 1 is ahead.
    expect(result.map((row) => [row.dueDate, row.pastDue ?? false])).toEqual([
      ["2025-11-01", true],
      ["2025-12-01", true],
      ["2026-01-01", true],
      ["2026-02-01", false],
    ]);
    // The backlog comes off the top: 1,000,000 - 300,000 x 4.
    expect(result.map((row) => row.runningBalance)).toEqual([700000, 400000, 100000, -200000]);
  });

  it("drops past occurrences that were settled, since settling writes a skip", () => {
    const rent = monthlyItem({
      id: "bill-rent",
      name: "Rent",
      type: "bill",
      amount: -300000,
      daysOfMonth: [1],
      startDate: "2025-11-01",
      endDate: "2026-01-31",
    });

    const overrides: OccurrenceOverride[] = [
      {
        id: "ov-1",
        recurringItemId: "bill-rent",
        originalDate: "2025-11-01",
        newDate: null,
        newAmount: null,
        newName: null,
        skipped: true,
      },
      {
        id: "ov-2",
        recurringItemId: "bill-rent",
        originalDate: "2025-12-01",
        newDate: null,
        newAmount: null,
        newName: null,
        skipped: true,
      },
    ];

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [rent],
      overrides,
      oneOffs: [],
      today: "2026-01-15",
      horizon: "2026-02-28",
    });

    // Only the one genuinely-unsettled past occurrence survives - a user who
    // settles as they go sees no backlog at all.
    expect(result.map((row) => row.dueDate)).toEqual(["2026-01-01"]);
    expect(result[0].pastDue).toBe(true);
  });

  it("does not mark a row past-due on its own due date", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [{ id: "off-1", name: "Due today", amount: -1000, dueDate: "2026-01-15", balanceId: null }],
      today: "2026-01-15",
      horizon: "2026-02-28",
    });

    expect(result[0].pastDue).toBeUndefined();
  });

  it("respects an occurrence moved out of the past by an override", () => {
    const bill = monthlyItem({
      id: "bill-1",
      name: "Water",
      type: "bill",
      amount: -50000,
      daysOfMonth: [1],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    const result = generateForecast({
      balances: [],
      recurringItems: [bill],
      overrides: [
        {
          id: "ov-1",
          recurringItemId: "bill-1",
          originalDate: "2026-01-01",
          newDate: "2026-01-20",
          newAmount: null,
          newName: null,
          skipped: false,
        },
      ],
      oneOffs: [],
      today: "2026-01-15",
      horizon: "2026-02-28",
    });

    // Past-due is judged on the effective date, not the original one - the
    // user moved this bill forward, so it isn't overdue.
    expect(result[0].dueDate).toBe("2026-01-20");
    expect(result[0].pastDue).toBeUndefined();
  });
});

describe("splitPastDue (T150)", () => {
  const rows = () =>
    generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [],
      overrides: [],
      oneOffs: [
        { id: "a", name: "Overdue bill", amount: -200000, dueDate: "2026-01-05", balanceId: null },
        { id: "b", name: "Overdue refund", amount: 50000, dueDate: "2026-01-10", balanceId: null },
        { id: "c", name: "Upcoming bill", amount: -100000, dueDate: "2026-02-01", balanceId: null },
      ],
      today: "2026-01-15",
      horizon: "2026-03-31",
    });

  it("separates the backlog and reports the balance it leaves behind", () => {
    const split = splitPastDue(rows(), 1000000);

    expect(split.pastDue.map((row) => row.name)).toEqual(["Overdue bill", "Overdue refund"]);
    expect(split.upcoming.map((row) => row.name)).toEqual(["Upcoming bill"]);
    // Signed: owed 200,000, expecting 50,000 back.
    expect(split.pastDueTotal).toBe(-150000);
    expect(split.balanceAfterPastDue).toBe(850000);
  });

  it("passes the starting balance straight through when nothing is past due", () => {
    const clean = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [],
      overrides: [],
      oneOffs: [{ id: "c", name: "Upcoming", amount: -100000, dueDate: "2026-02-01", balanceId: null }],
      today: "2026-01-15",
      horizon: "2026-03-31",
    });

    const split = splitPastDue(clean, 1000000);

    expect(split.pastDue).toEqual([]);
    expect(split.pastDueTotal).toBe(0);
    expect(split.balanceAfterPastDue).toBe(1000000);
  });
});

// T155 (SPEC.md Phase 20): the Forecast shows a comment-bubble indicator on
// any row whose underlying record has a comment. The engine only passes the
// value through - it never reads it - but the pass-through is what the
// indicator depends on, and the empty-string handling is the part with an
// actual decision in it.
describe("generateForecast comment pass-through (T155)", () => {
  it("carries a recurring item's comment onto every one of its rows", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [
        monthlyItem({
          id: "bill-1",
          name: "Electric",
          daysOfMonth: [10],
          comments: "meter reading day",
        }),
      ],
      overrides: [],
      oneOffs: [],
      today,
      horizon,
    });

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((row) => row.comment === "meter reading day")).toBe(true);
  });

  it("carries a one-off's comment", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [
        { id: "off-1", name: "Repair", amount: -1000, dueDate: "2026-01-05", balanceId: null, comments: "quoted price" },
      ],
      today,
      horizon,
    });

    expect(result[0].comment).toBe("quoted price");
  });

  it("omits the comment when absent, null, or only whitespace", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [
        { id: "a", name: "No field", amount: -1, dueDate: "2026-01-05", balanceId: null },
        { id: "b", name: "Null", amount: -1, dueDate: "2026-01-06", balanceId: null, comments: null },
        { id: "c", name: "Blank", amount: -1, dueDate: "2026-01-07", balanceId: null, comments: "   " },
      ],
      today,
      horizon,
    });

    // Undefined rather than null or "" - a blank comment must not render an
    // indicator with nothing behind it.
    expect(result.map((row) => row.comment)).toEqual([undefined, undefined, undefined]);
  });
});

// T168 (user request 2026-07-31): a projected budget replenishment is
// adjustable per instance - amount, date, or both - via
// budget_replenish_overrides, which until migration 0027 could only say
// "skipped". Same per-instance override shape recurring items have always had.
describe("generateForecast budget replenish per-instance edits (T168)", () => {
  const ownScheduleBudget = testBudget({
    id: "budget-1",
    name: "Groceries",
    allocation: 1000000,
    linkedIncomeId: null,
    startDate: "2026-01-05",
    interval: 1,
    unit: "month",
    daysOfMonth: [5],
    endsType: "never",
  });

  const run = (budgetReplenishOverrides: BudgetReplenishOverride[]) =>
    generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [ownScheduleBudget],
      budgetEntries: [],
      budgetReplenishOverrides,
      today: "2026-01-01",
      horizon: "2026-02-28",
    }).filter((row) => row.sourceType === "budget_replenish");

  it("uses the allocation and scheduled date when no override exists", () => {
    expect(run([]).map((row) => [row.dueDate, row.amount, row.edited ?? false])).toEqual([
      ["2026-01-05", -1000000, false],
      ["2026-02-05", -1000000, false],
    ]);
  });

  it("applies a changed amount to only that occurrence", () => {
    const rows = run([
      {
        id: "ov-1",
        budgetId: "budget-1",
        originalDate: "2026-01-05",
        skipped: false,
        newDate: null,
        newAmount: 800000,
      },
    ]);

    // 8,000 instead of 10,000 in January; February untouched.
    expect(rows.map((row) => [row.dueDate, row.amount, row.edited ?? false])).toEqual([
      ["2026-01-05", -800000, true],
      ["2026-02-05", -1000000, false],
    ]);
  });

  it("moves a single occurrence without changing its amount", () => {
    const rows = run([
      {
        id: "ov-1",
        budgetId: "budget-1",
        originalDate: "2026-02-05",
        skipped: false,
        newDate: "2026-01-28",
        newAmount: null,
      },
    ]);

    // Moved earlier, so it now sorts ahead of its own January sibling.
    expect(rows.map((row) => [row.dueDate, row.amount])).toEqual([
      ["2026-01-05", -1000000],
      ["2026-01-28", -1000000],
    ]);
    expect(rows[1].originalDate).toBe("2026-02-05");
    expect(rows[1].edited).toBe(true);
  });

  it("applies amount and date together", () => {
    const rows = run([
      {
        id: "ov-1",
        budgetId: "budget-1",
        originalDate: "2026-01-05",
        skipped: false,
        newDate: "2026-01-20",
        newAmount: 250000,
      },
    ]);

    expect(rows[0].dueDate).toBe("2026-01-20");
    expect(rows[0].amount).toBe(-250000);
  });

  it("still drops a skipped occurrence, edits or not", () => {
    const rows = run([
      {
        id: "ov-1",
        budgetId: "budget-1",
        originalDate: "2026-01-05",
        skipped: true,
        newDate: "2026-01-20",
        newAmount: 250000,
      },
    ]);

    // Skip wins - a settled replenishment must not reappear just because it
    // also carries edit fields.
    expect(rows.map((row) => row.dueDate)).toEqual(["2026-02-05"]);
  });
});

// T173 (SPEC.md Phase 22): a "due today" flag alongside T150's past-due one,
// so the Forecast can mark today's rows amber. Mutually exclusive with
// pastDue by construction - the interesting part is the boundary between them.
describe("generateForecast dueToday (T173)", () => {
  const run = (today: string) =>
    generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [
        { id: "a", name: "Yesterday", amount: -100, dueDate: "2026-01-14", balanceId: null },
        { id: "b", name: "Today", amount: -100, dueDate: "2026-01-15", balanceId: null },
        { id: "c", name: "Tomorrow", amount: -100, dueDate: "2026-01-16", balanceId: null },
      ],
      today,
      horizon: "2026-03-31",
    });

  it("flags only the row landing on today", () => {
    expect(run("2026-01-15").map((row) => [row.name, row.pastDue ?? false, row.dueToday ?? false])).toEqual([
      ["Yesterday", true, false],
      ["Today", false, true],
      ["Tomorrow", false, false],
    ]);
  });

  it("never sets both flags on the same row", () => {
    for (const row of run("2026-01-15")) {
      expect(row.pastDue && row.dueToday).toBeFalsy();
    }
  });

  it("moves the flag with today, so yesterday's due-today row is now past-due", () => {
    const rows = run("2026-01-16");
    expect(rows.map((row) => [row.name, row.pastDue ?? false, row.dueToday ?? false])).toEqual([
      ["Yesterday", true, false],
      ["Today", true, false],
      ["Tomorrow", false, true],
    ]);
  });

  it("leaves dueToday off entirely when nothing falls on today", () => {
    const rows = run("2026-01-20");
    expect(rows.every((row) => row.dueToday === undefined)).toBe(true);
  });
});

// T175 (SPEC.md Phase 22): temporarily disabling a record hides it from the
// forecast without deleting it, so the user can see the impact of dropping a
// bill without losing its history. Filtered at the top of expansion, so the
// interesting assertions are about everything downstream staying consistent.
describe("generateForecast disabled records (T175)", () => {
  it("excludes a disabled recurring item and its effect on the running balance", () => {
    const active = monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5] });
    const disabled = monthlyItem({
      id: "bill-2",
      name: "Gym",
      amount: -100000,
      daysOfMonth: [5],
      active: false,
    });

    const result = generateForecast({
      balances: [{ id: "bal-1", name: "Cash", amount: 1000000 }],
      recurringItems: [active, disabled],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["Rent"]);
    // The disabled item leaves no trace in the balance either.
    expect(result[0].runningBalance).toBe(700000);
  });

  it("excludes a disabled one-off", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [
        { id: "a", name: "Kept", amount: -100, dueDate: "2026-01-10", balanceId: null },
        { id: "b", name: "Disabled", amount: -999, dueDate: "2026-01-11", balanceId: null, active: false },
      ],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["Kept"]);
  });

  it("treats undefined active as active, so existing data is unaffected", () => {
    const result = generateForecast({
      balances: [],
      recurringItems: [monthlyItem({ id: "bill-1", name: "Rent", daysOfMonth: [5] })],
      overrides: [],
      oneOffs: [{ id: "a", name: "Extra", amount: -100, dueDate: "2026-01-10", balanceId: null }],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result.map((row) => row.name)).toEqual(["Rent", "Extra"]);
  });

  it("disabling an income also stops its linked budget replenishing", () => {
    // The linked budget borrows its replenish dates from the income's own
    // occurrences, so filtering the income at the top of expansion has to
    // take the budget's projected rows with it - the whole point of
    // filtering there rather than per-calculation.
    const income = monthlyItem({
      id: "income-1",
      name: "Salary",
      type: "income",
      amount: 5000000,
      daysOfMonth: [5],
      active: false,
    });
    const budget = testBudget({ id: "budget-1", name: "Groceries", linkedIncomeId: "income-1" });

    const result = generateForecast({
      balances: [],
      recurringItems: [income],
      overrides: [],
      oneOffs: [],
      budgets: [budget],
      budgetEntries: [],
      budgetReplenishOverrides: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result).toEqual([]);
  });

  it("excludes a disabled budget's projected replenishments", () => {
    const budget = testBudget({
      id: "budget-1",
      name: "Groceries",
      allocation: 500000,
      linkedIncomeId: null,
      startDate: "2026-01-05",
      interval: 1,
      unit: "month",
      daysOfMonth: [5],
      endsType: "never",
      active: false,
    });

    const result = generateForecast({
      balances: [],
      recurringItems: [],
      overrides: [],
      oneOffs: [],
      budgets: [budget],
      budgetEntries: [],
      budgetReplenishOverrides: [],
      today: "2026-01-01",
      horizon: "2026-02-28",
    });

    expect(result).toEqual([]);
  });
});

// T172 (SPEC.md Phase 20): a per-account transaction fee, auto-deducted from
// every forecasted transaction connected to that account - both directions,
// per the user's own "all forecasted transactions" framing, not just
// outflows. Shown as its own field rather than folded into `amount`, so a
// bill's displayed amount always matches its real record.
describe("generateForecast per-account transaction fee (T172)", () => {
  it("subtracts the fee from an outgoing bill's connected account", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000, transactionFeeCentavos: 1000 }],
      recurringItems: [
        monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5], balanceId: "bal-1" }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBe(1000);
    // 1,000,000 - 300,000 (bill) - 1,000 (fee) = 699,000.
    expect(result[0].runningBalance).toBe(699000);
  });

  it("also subtracts the fee from an incoming income's connected account", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000, transactionFeeCentavos: 1000 }],
      recurringItems: [
        monthlyItem({
          id: "income-1",
          name: "Salary",
          type: "income",
          amount: 500000,
          daysOfMonth: [5],
          balanceId: "bal-1",
        }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBe(1000);
    // 1,000,000 + 500,000 (income) - 1,000 (fee, a cost regardless of
    // direction) = 1,499,000.
    expect(result[0].runningBalance).toBe(1499000);
  });

  it("applies to a connected one-off too", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "GCash", amount: 500000, transactionFeeCentavos: 500 }],
      recurringItems: [],
      overrides: [],
      oneOffs: [{ id: "off-1", name: "Gift", amount: -100000, dueDate: "2026-01-10", balanceId: "bal-1" }],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBe(500);
    expect(result[0].runningBalance).toBe(399500);
  });

  it("charges the fee independently on every occurrence, not just once", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000, transactionFeeCentavos: 1000 }],
      recurringItems: [
        monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5], balanceId: "bal-1" }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-03-31",
    });

    expect(result.map((row) => row.feeAmount)).toEqual([1000, 1000, 1000]);
    expect(result.map((row) => row.runningBalance)).toEqual([699000, 398000, 97000]);
  });

  it("charges no fee when the item has no connected account", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000, transactionFeeCentavos: 1000 }],
      recurringItems: [
        monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5], balanceId: null }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBeUndefined();
    expect(result[0].runningBalance).toBe(700000);
  });

  it("treats a zero fee the same as no fee at all", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000, transactionFeeCentavos: 0 }],
      recurringItems: [
        monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5], balanceId: "bal-1" }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBeUndefined();
    expect(result[0].runningBalance).toBe(700000);
  });

  it("charges nothing when the balances list omits transactionFeeCentavos entirely", () => {
    const result = generateForecast({
      balances: [{ id: "bal-1", name: "BDO", amount: 1000000 }],
      recurringItems: [
        monthlyItem({ id: "bill-1", name: "Rent", amount: -300000, daysOfMonth: [5], balanceId: "bal-1" }),
      ],
      overrides: [],
      oneOffs: [],
      today: "2026-01-01",
      horizon: "2026-01-31",
    });

    expect(result[0].feeAmount).toBeUndefined();
    expect(result[0].runningBalance).toBe(700000);
  });
});
