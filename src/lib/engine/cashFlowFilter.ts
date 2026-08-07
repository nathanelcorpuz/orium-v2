import type { BudgetBalanceLink, BudgetEntry, ForecastRow } from "./types";
import { computeBudgetAccountBalance } from "./budgetLedger";

export interface CashFlowOnlyResult {
  rows: ForecastRow[];
  startingBalance: number;
}

// T284 (SPEC.md Phase 49), redesigned per user follow-up (2026-08-08):
// "Exclude budgets" hides budget MONEY, not whole accounts - an account
// used for both budgets and regular cash flow keeps showing its ordinary
// bills/income when this is on, only its budget-attributed rows/amount
// disappear.
//
// Row filter: any "budget_replenish" (both the visible debit and the
// hidden credit leg(s), forecast.ts) or "budget_entry" row is dropped,
// unconditionally - these rows ARE the budget money moving, wherever they
// live, so which account they're attributed to is irrelevant here.
//
// Starting-total filter: an account's *whole* balance is never dropped
// anymore. Instead, for every budget-account link, `computeBudgetAccountBalance`
// (T222 - already built to answer "how much of this account is Pocket
// Money vs Groceries") gives exactly the portion of that account's current
// balance attributable to budget activity, summed over every link. This is
// self-consistent even when negative (a budget that spent more from an
// account than it was ever credited there) - every budget-attributed entry
// always moves the account's *real* balance by the same amount (T204/T218's
// `applyToBudgetAccount`), so `balance - budgetPortion` always equals
// exactly the account's non-budget activity, never more or less.
export function filterCashFlowOnly(
  rows: ForecastRow[],
  budgetEntries: BudgetEntry[],
  budgetBalanceLinks: BudgetBalanceLink[],
  startingTotal: number,
  today: string,
): CashFlowOnlyResult {
  const budgetPortion = budgetBalanceLinks.reduce(
    (sum, link) => sum + computeBudgetAccountBalance(budgetEntries, link.budgetId, link.balanceId, today),
    0,
  );
  const startingBalance = startingTotal - budgetPortion;

  const filteredRows = rows.filter(
    (row) => row.sourceType !== "budget_replenish" && row.sourceType !== "budget_entry",
  );

  let running = startingBalance;
  const recomputed = filteredRows.map((row) => {
    // Same combined-total treatment generateForecast itself uses (Bug #19) -
    // an income-auto-move leg never changes the combined total, regardless
    // of which side of the pair survived this filter.
    const contribution = row.sourceType === "income_auto_move" ? 0 : row.amount;
    running = Math.round(running + contribution - (row.feeAmount ?? 0));
    return { ...row, runningBalance: running };
  });

  return { rows: recomputed, startingBalance };
}

// T284 follow-up: per-account budget portion, exposed on its own so the
// Forecast page's balance chips can show "this account minus its own
// budget-attributed money" when "Exclude budgets" is on, rather than only
// adjusting the combined total.
export function budgetPortionByBalanceId(
  budgetEntries: BudgetEntry[],
  budgetBalanceLinks: BudgetBalanceLink[],
  today: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const link of budgetBalanceLinks) {
    const portion = computeBudgetAccountBalance(budgetEntries, link.budgetId, link.balanceId, today);
    result.set(link.balanceId, (result.get(link.balanceId) ?? 0) + portion);
  }
  return result;
}
