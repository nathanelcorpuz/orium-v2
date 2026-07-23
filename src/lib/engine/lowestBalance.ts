import type { ForecastRow } from "./types";

export interface LowestBalancePoint {
  balance: number; // centavos
  date: string; // YYYY-MM-DD - `today` when the starting balance itself is the lowest point
}

/**
 * Scans the *entire* forecast horizon (not month-by-month like Peaks and
 * Drops) for the single lowest running balance and the date it lands on
 * (SPEC.md T46). The starting balance itself is a candidate too - if every
 * future row nets positive from here, today already *is* the lowest point,
 * not some later date. Ties keep the earliest date (strict `<`, not `<=`),
 * so a balance that dips and later returns to the exact same low reports
 * the first time it happened.
 */
export function findLowestBalancePoint(
  rows: ForecastRow[],
  startingBalance: number,
  today: string,
): LowestBalancePoint {
  let lowest: LowestBalancePoint = { balance: startingBalance, date: today };

  for (const row of rows) {
    if (row.runningBalance < lowest.balance) {
      lowest = { balance: row.runningBalance, date: row.dueDate };
    }
  }

  return lowest;
}
