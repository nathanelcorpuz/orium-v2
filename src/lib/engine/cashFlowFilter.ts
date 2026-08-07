import type { Balance, ForecastRow } from "./types";

export interface CashFlowOnlyResult {
  rows: ForecastRow[];
  startingBalance: number;
}

// T284 (SPEC.md Phase 49): "Cash Flow Only" - a presentation-layer filter
// over an already-computed forecast, not a second engine run. Accounts
// tagged `usedForBudgets` (and every row attributed to one, via
// `balanceId`) are treated as if they don't exist: their starting amount is
// dropped from the total, and the running balance is recomputed over
// whatever rows remain. A budget's projected replenish debit (attributed to
// its *income's* account, not the flagged destination) survives this
// filter and still reduces the total normally - money leaving toward a
// budget still leaves your cash-flow-only view, exactly reproducing the
// pre-T284 default where budget accounts were always excluded. The hidden
// credit leg into the flagged destination (forecast.ts) simply never
// appears here, since its own `balanceId` is flagged.
export function filterCashFlowOnly(
  rows: ForecastRow[],
  balances: Balance[],
  startingTotal: number,
): CashFlowOnlyResult {
  const flaggedIds = new Set(balances.filter((b) => b.usedForBudgets).map((b) => b.id));
  if (flaggedIds.size === 0) return { rows, startingBalance: startingTotal };

  const flaggedStartingSum = balances
    .filter((b) => flaggedIds.has(b.id))
    .reduce((sum, b) => sum + b.amount, 0);
  const startingBalance = startingTotal - flaggedStartingSum;

  const filteredRows = rows.filter((row) => !(row.balanceId && flaggedIds.has(row.balanceId)));

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
