import { describe, expect, it } from "vitest";
import { budgetPortionByBalanceId, filterCashFlowOnly } from "./cashFlowFilter";
import type { BudgetBalanceLink, BudgetEntry, ForecastRow } from "./types";

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

function entry(overrides: Partial<BudgetEntry> & { budgetId: string; amount: number; entryDate: string }): BudgetEntry {
  return { id: "e1", note: null, direction: "incoming", ...overrides } as BudgetEntry;
}

describe("filterCashFlowOnly", () => {
  it("returns rows unchanged and only drops the starting total when there are no budget links", () => {
    const rows = [row({ balanceId: "checking" })];
    const result = filterCashFlowOnly(rows, [], [], 1000, "2026-01-10");
    expect(result).toEqual({ rows, startingBalance: 1000 });
  });

  it("drops budget_replenish and budget_entry rows regardless of which account they're attributed to", () => {
    const rows = [
      row({ sourceId: "bill-1", balanceId: "checking" }),
      row({ sourceId: "budget-1", sourceType: "budget_replenish", balanceId: "checking", amount: -500 }),
      row({ sourceId: "budget-1", sourceType: "budget_replenish", balanceId: "groceries", amount: 500, hidden: true }),
      row({ sourceId: "spend-1", sourceType: "budget_entry", balanceId: "groceries", amount: -200 }),
    ];
    const result = filterCashFlowOnly(rows, [], [], 1000, "2026-01-10");
    expect(result.rows.map((r) => r.sourceId)).toEqual(["bill-1"]);
  });

  it("keeps a regular bill connected to a budget-linked account visible - mixed-use accounts", () => {
    const rows = [
      row({ sourceId: "bill-1", balanceId: "groceries-acct", amount: -300 }),
      row({ sourceId: "budget-1", sourceType: "budget_entry", balanceId: "groceries-acct", amount: -200 }),
    ];
    const links: BudgetBalanceLink[] = [{ budgetId: "groceries", balanceId: "groceries-acct", replenishAmount: 500 }];
    const entries: BudgetEntry[] = [
      entry({ id: "e1", budgetId: "groceries", balanceId: "groceries-acct", entryDate: "2026-01-01", amount: 1000, direction: "incoming" }),
    ];

    const result = filterCashFlowOnly(rows, entries, links, 5000, "2026-01-10");

    // The regular bill survives (mixed-use account keeps its non-budget rows).
    expect(result.rows.map((r) => r.sourceId)).toEqual(["bill-1"]);
    // 1000 credited to this budget in this account is excluded from the total.
    expect(result.startingBalance).toBe(4000);
  });

  it("nets a negative budget portion the same way - self-consistent even when a budget overspent an account", () => {
    const links: BudgetBalanceLink[] = [{ budgetId: "groceries", balanceId: "acct-a", replenishAmount: 100 }];
    const entries: BudgetEntry[] = [
      entry({ id: "e1", budgetId: "groceries", balanceId: "acct-a", entryDate: "2026-01-01", amount: 100, direction: "incoming" }),
      entry({ id: "e2", budgetId: "groceries", balanceId: "acct-a", entryDate: "2026-01-02", amount: 150, direction: "outgoing" }),
    ];
    // Account started at 0 and every dollar that ever touched it came from
    // this budget - the account's whole real balance (-50) is budget money,
    // so the cash-flow-only portion should be exactly 0, not -50 or +50.
    const result = filterCashFlowOnly([], entries, links, -50, "2026-01-10");
    expect(result.startingBalance).toBe(0);
  });

  it("ignores budget entries dated after asOf", () => {
    const links: BudgetBalanceLink[] = [{ budgetId: "groceries", balanceId: "acct-a", replenishAmount: 100 }];
    const entries: BudgetEntry[] = [
      entry({ id: "e1", budgetId: "groceries", balanceId: "acct-a", entryDate: "2026-02-01", amount: 500, direction: "incoming" }),
    ];
    const result = filterCashFlowOnly([], entries, links, 1000, "2026-01-10");
    expect(result.startingBalance).toBe(1000);
  });

  it("zeroes income_auto_move rows' own contribution, matching generateForecast's own combined-total treatment", () => {
    const rows = [
      row({ sourceType: "income_auto_move", balanceId: "a", amount: -400 }),
      row({ sourceType: "recurring", balanceId: "a", amount: -100 }),
    ];
    const result = filterCashFlowOnly(rows, [], [], 1000, "2026-01-10");
    expect(result.rows[result.rows.length - 1].runningBalance).toBe(900);
  });
});

describe("budgetPortionByBalanceId", () => {
  it("sums every linked budget's attributed portion per account", () => {
    const links: BudgetBalanceLink[] = [
      { budgetId: "groceries", balanceId: "acct-a", replenishAmount: 100 },
      { budgetId: "gas", balanceId: "acct-a", replenishAmount: 50 },
      { budgetId: "groceries", balanceId: "acct-b", replenishAmount: 100 },
    ];
    const entries: BudgetEntry[] = [
      entry({ id: "e1", budgetId: "groceries", balanceId: "acct-a", entryDate: "2026-01-01", amount: 1000, direction: "incoming" }),
      entry({ id: "e2", budgetId: "gas", balanceId: "acct-a", entryDate: "2026-01-01", amount: 300, direction: "incoming" }),
      entry({ id: "e3", budgetId: "groceries", balanceId: "acct-b", entryDate: "2026-01-01", amount: 700, direction: "incoming" }),
    ];

    const result = budgetPortionByBalanceId(entries, links, "2026-01-10");
    expect(result.get("acct-a")).toBe(1300);
    expect(result.get("acct-b")).toBe(700);
  });

  it("returns an empty map when there are no links", () => {
    expect(budgetPortionByBalanceId([], [], "2026-01-10").size).toBe(0);
  });
});
