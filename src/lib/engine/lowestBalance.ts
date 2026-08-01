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

export interface NextTransactionBatch {
  date: string; // YYYY-MM-DD
  count: number; // how many real transactions share this date
}

/**
 * SPEC.md T215 (user request 2026-08-01): "days until next transaction(s) to
 * settle" - the earliest upcoming date with at least one real, settleable
 * transaction, and how many share it (a payday and a bill due the same day
 * count as 2, not one generic "something's due"). Excludes `hidden` rows
 * (T214's auto-move legs - bookkeeping for the balance, not their own
 * transaction) and `fromScenario` rows (hypothetical, not a real obligation
 * to settle). Callers pass the same `upcoming` (past-due already excluded)
 * rows findLowestBalancePoint/findFirstDangerPoint already use, so "next"
 * here means "next not-yet-due-or-overdue," matching this card's other two
 * stats. Order-independent (tracks the earliest date seen, not the first
 * row), same as those two.
 */
export function findNextTransactionBatch(rows: ForecastRow[]): NextTransactionBatch | null {
  let nextDate: string | null = null;
  let count = 0;

  for (const row of rows) {
    if (row.hidden || row.fromScenario) continue;
    if (nextDate === null || row.dueDate < nextDate) {
      nextDate = row.dueDate;
      count = 1;
    } else if (row.dueDate === nextDate) {
      count += 1;
    }
  }

  return nextDate === null ? null : { date: nextDate, count };
}
