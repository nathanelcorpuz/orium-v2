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

// T294 (user request 2026-08-08): "i want to also know when the first
// negative instance of an account will be, on top of the lowest projected.
// i want them to both show at the same time." Per-account version of
// `findFirstDangerPoint` (lowestBalance.ts) - same "when does trouble start"
// vs. "how bad does it get" distinction Bug #13's `dangerThreshold` already
// draws for the *combined* total, just walked per-account using the exact
// same attribution rule `findAccountLowestPoints` above already established.
// Null means this account never crosses into danger anywhere in the
// horizon - including today, which is a candidate the same way
// findFirstDangerPoint treats the starting balance as one.
export function findAccountFirstDangerPoints(
  rows: ForecastRow[],
  startingBalances: { id: string; amount: number }[],
  dangerThreshold: number,
  today: string,
): Map<string, AccountLowestPoint | null> {
  const current = new Map<string, number>();
  const firstDanger = new Map<string, AccountLowestPoint | null>();
  for (const balance of startingBalances) {
    current.set(balance.id, balance.amount);
    firstDanger.set(balance.id, balance.amount <= dangerThreshold ? { balance: balance.amount, date: today } : null);
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

    if (firstDanger.get(targetId) === null && next <= dangerThreshold) {
      firstDanger.set(targetId, { balance: next, date: row.dueDate });
    }
  }

  return firstDanger;
}

interface AccountBalanceAtRow {
  balance: number; // centavos, this row's own attributed account, after this row is applied
  targetId: string; // which account this row was actually attributed to (see the rule above)
}

// Bug fix (2026-08-04, reported against real production data): an income
// row's own hidden `income_auto_move` debit leg (T212/T214) always sorts
// *after* the income row in `forecast.ts`'s output - incoming rows sort
// before outgoing ones on a shared due date, and a debit is outgoing no
// matter how it's pushed - so the walk below always records an income row's
// "balance after this" before its own same-occurrence auto-move has left the
// account, even though T214 presents the auto-move as part of the income's
// own transaction (a tag on its row), not a separate later one. Concretely
// reported: an income auto-moving its *entire* amount to another account
// still showed its source account's balance as if the full income had
// stayed put. `netTiedAutoMoveEffect` sums the same-occurrence debit leg(s)
// (matched by `linkedIncomeId` + `originalDate`, restricted to legs hitting
// this row's own `balanceId` - a leg crediting a *different* account isn't
// part of what this row's own account holds) and folds that into the
// snapshot recorded for the income row only - the running `current` map
// itself, which every later row's own snapshot depends on, is untouched, so
// this doesn't change any other row's figure or the combined total.
function netTiedAutoMoveEffect(row: ForecastRow, autoMoveNetByKey: Map<string, number>): number {
  if (row.sourceType !== "recurring" || row.type !== "income" || !row.balanceId) return 0;
  return autoMoveNetByKey.get(`${row.sourceId}|${row.originalDate}|${row.balanceId}`) ?? 0;
}

// T191 (user request): "if a forecasted transaction has an account connected
// to it, show me what that account's balance will be at that point in
// time" - distinct from `ForecastRow.runningBalance`, which is always the
// combined total across every account. Same attribution rule as
// `findAccountLowestPoints` above, walked once over every row and recording
// each row's own resulting balance (not just the running lowest), keyed by
// row object identity - a caller already holding one of these exact row
// objects (e.g. from opening a modal on click) can look up its account
// balance in O(1) without re-walking the whole forecast per click. Kept as
// a second full pass rather than merged into `findAccountLowestPoints`
// itself, so that function's existing return shape/tests are untouched.
export function computeAccountBalancesAfterEachRow(
  rows: ForecastRow[],
  startingBalances: { id: string; amount: number }[],
): Map<ForecastRow, AccountBalanceAtRow> {
  const current = new Map<string, number>();
  for (const balance of startingBalances) {
    current.set(balance.id, balance.amount);
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

  const autoMoveNetByKey = new Map<string, number>();
  for (const moveRow of rows) {
    if (moveRow.sourceType !== "income_auto_move" || !moveRow.linkedIncomeId || !moveRow.balanceId) continue;
    const key = `${moveRow.linkedIncomeId}|${moveRow.originalDate}|${moveRow.balanceId}`;
    const fee = moveRow.feeAmount ?? 0;
    autoMoveNetByKey.set(key, (autoMoveNetByKey.get(key) ?? 0) + moveRow.amount - fee);
  }

  const result = new Map<ForecastRow, AccountBalanceAtRow>();
  for (const row of rows) {
    const targetId = row.balanceId && current.has(row.balanceId) ? row.balanceId : highestAccountId();
    if (targetId === null) continue; // no tracked accounts at all

    const fee = row.feeAmount ?? 0;
    const next = Math.round((current.get(targetId) ?? 0) + row.amount - fee);
    current.set(targetId, next);
    const reported = Math.round(next + netTiedAutoMoveEffect(row, autoMoveNetByKey));
    result.set(row, { balance: reported, targetId });
  }
  return result;
}

// A row only "has an account connected to it" (this feature's own scoping,
// per the user's request) when `row.balanceId` is both set and still a real
// tracked account - if it were deleted since this map was computed, the row
// would have fallen back to the highest-balance account above, which is a
// different account than the one the row still (stalely) claims to point
// at, and showing that would be actively misleading rather than merely
// absent. `on delete set null` on every balance_id FK means this fallback
// path is normally unreachable in practice (deleting an account clears the
// link at the same time), but this stays cheap insurance against a stale
// row slipping through anyway.
export function accountBalanceForRow(
  row: ForecastRow,
  balancesAfterEachRow: Map<ForecastRow, AccountBalanceAtRow>,
): number | null {
  if (!row.balanceId) return null;
  const entry = balancesAfterEachRow.get(row);
  return entry && entry.targetId === row.balanceId ? entry.balance : null;
}
