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

/**
 * The single *lowest* point (above) can land well after the balance first
 * crosses into trouble - a big hit followed by an oscillating recovery
 * (SPEC.md's T88 seed scenario: first goes negative Sept 1, doesn't hit its
 * actual worst point until Sept 13) makes "Lowest Balance Ahead: Sep 13"
 * read like Sept 13 is when things start going wrong, when they actually
 * started 12 days earlier. This scans forward for the *first* date the
 * balance is at or below `dangerThreshold` (SPEC.md's balance_ranges[0], the
 * same boundary balanceRangeTier's "danger" tier uses) - a distinct,
 * earlier-or-equal-to-the-lowest-point stat answering "when does trouble
 * start" rather than "how bad does it get." Returns null when the balance
 * never crosses into danger anywhere in the horizon (including today, which
 * is a candidate the same way findLowestBalancePoint treats the starting
 * balance as one).
 */
export function findFirstDangerPoint(
  rows: ForecastRow[],
  startingBalance: number,
  dangerThreshold: number,
  today: string,
): LowestBalancePoint | null {
  if (startingBalance <= dangerThreshold) {
    return { balance: startingBalance, date: today };
  }

  for (const row of rows) {
    if (row.runningBalance <= dangerThreshold) {
      return { balance: row.runningBalance, date: row.dueDate };
    }
  }

  return null;
}
