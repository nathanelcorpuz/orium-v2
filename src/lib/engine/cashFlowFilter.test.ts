import { describe, expect, it } from "vitest";
import { filterCashFlowOnly } from "./cashFlowFilter";
import type { Balance, ForecastRow } from "./types";

function row(overrides: Partial<ForecastRow>): ForecastRow {
  return {
    sourceType: "recurring",
    sourceId: "item-1",
    originalDate: "2026-01-05",
    name: "Row",
    amount: -1000,
    dueDate: "2026-01-05",
    type: "bill",
    runningBalance: 0,
    ...overrides,
  };
}

describe("filterCashFlowOnly", () => {
  it("returns the input unchanged when no account is flagged", () => {
    const balances: Balance[] = [{ id: "a", name: "A", amount: 1000 }];
    const rows = [row({ balanceId: "a", runningBalance: 500 })];
    const result = filterCashFlowOnly(rows, balances, 1000);
    expect(result).toEqual({ rows, startingBalance: 1000 });
  });

  it("drops a flagged account's starting balance and its own rows, recomputing the running total", () => {
    const balances: Balance[] = [
      { id: "checking", name: "Checking", amount: 1000 },
      { id: "budget-acct", name: "Groceries", amount: 500, usedForBudgets: true },
    ];
    const rows = [
      row({ sourceId: "bill-1", balanceId: "checking", amount: -200, dueDate: "2026-01-05" }),
      row({ sourceId: "spend-1", sourceType: "budget_entry", balanceId: "budget-acct", amount: -300, dueDate: "2026-01-06" }),
    ];

    const result = filterCashFlowOnly(rows, balances, 1500);

    expect(result.startingBalance).toBe(1000);
    expect(result.rows.map((r) => r.sourceId)).toEqual(["bill-1"]);
    expect(result.rows[0].runningBalance).toBe(800);
  });

  it("keeps a budget replenish debit attributed to a non-flagged account, still reducing the total", () => {
    const balances: Balance[] = [
      { id: "checking", name: "Checking", amount: 100000 },
      { id: "budget-acct", name: "Groceries", amount: 0, usedForBudgets: true },
    ];
    const rows = [
      row({ sourceId: "budget-1", sourceType: "budget_replenish", balanceId: "checking", amount: -50000, hidden: undefined }),
      row({
        sourceId: "budget-1",
        sourceType: "budget_replenish",
        balanceId: "budget-acct",
        amount: 50000,
        hidden: true,
      }),
    ];

    const result = filterCashFlowOnly(rows, balances, 100000);

    expect(result.startingBalance).toBe(100000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].runningBalance).toBe(50000);
  });

  it("zeroes income_auto_move rows' own contribution, matching generateForecast's own combined-total treatment", () => {
    const balances: Balance[] = [
      { id: "a", name: "A", amount: 1000 },
      { id: "flagged", name: "Flagged", amount: 0, usedForBudgets: true },
    ];
    const rows = [
      row({ sourceType: "income_auto_move", balanceId: "a", amount: -400 }),
      row({ sourceType: "recurring", balanceId: "a", amount: -100 }),
    ];

    const result = filterCashFlowOnly(rows, balances, 1000);
    expect(result.startingBalance).toBe(1000);
    // income_auto_move contributes 0, the plain bill contributes -100.
    expect(result.rows[result.rows.length - 1].runningBalance).toBe(900);
  });
});
