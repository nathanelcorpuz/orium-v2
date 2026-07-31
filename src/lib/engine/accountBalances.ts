import type { ForecastRow } from "./types";

export interface AccountLowestPoint {
  balance: number; // centavos
  date: string; // YYYY-MM-DD - `today` when the account's starting balance is already its lowest point
}

// T180 (SPEC.md "Before MVP launch", resolved into a real task): a
// per-account version of `findLowestBalancePoint` - "what will *this
// specific account* hold on a given future date," scoped down to its
// single most actionable answer, "will it ever dip, and to what."
//
// Every row is attributed to an account one of two ways:
//   1. `row.balanceId`, when the underlying bill/income/debt/savings/misc
//      item (or account-fee deduction) is actually connected to one (T71).
//   2. Otherwise, whichever tracked account currently holds the *highest*
//      balance as of just before this row - the user's own rule for money
//      that isn't tied to a specific account ("it has to come from/go to
//      somewhere, so assume the biggest pot"). This also naturally covers
//      every budget-related row (`budget_replenish`/`budget_entry`), which
//      never carry a `balanceId` at all (budgets have no T71 connected
//      account of their own) - no special-casing needed for them.
//
// Kept alongside `lowestBalance.ts` rather than folded into `forecast.ts`
// itself: this is a second, independent pass over the same rows for a
// different question (per-account, not combined), and every account's
// series is fully independent of the others once the attribution above is
// resolved - it doesn't change `generateForecast`'s own output at all.
export function findAccountLowestPoints(
  rows: ForecastRow[],
  startingBalances: { id: string; amount: number }[],
  today: string,
): Map<string, AccountLowestPoint> {
  const current = new Map<string, number>();
  const lowest = new Map<string, AccountLowestPoint>();
  for (const balance of startingBalances) {
    current.set(balance.id, balance.amount);
    lowest.set(balance.id, { balance: balance.amount, date: today });
  }

  function highestAccountId(): string | null {
    let bestId: string | null = null;
    let bestAmount = -Infinity;
    for (const [id, amount] of current) {
      if (amount > bestAmount) {
        bestAmount = amount;
        bestId = id;
      }
    }
    return bestId;
  }

  for (const row of rows) {
    const targetId = row.balanceId && current.has(row.balanceId) ? row.balanceId : highestAccountId();
    if (targetId === null) continue; // no tracked accounts at all

    const fee = row.feeAmount ?? 0;
    const next = Math.round((current.get(targetId) ?? 0) + row.amount - fee);
    current.set(targetId, next);

    const lowestSoFar = lowest.get(targetId);
    if (lowestSoFar && next < lowestSoFar.balance) {
      lowest.set(targetId, { balance: next, date: row.dueDate });
    }
  }

  return lowest;
}
