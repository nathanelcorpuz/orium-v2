import type { ForecastRow } from "./types";

export type MonthlyPeakDrop = {
  month: string; // YYYY-MM
  peak: number;
  drop: number;
};

/**
 * Computes the max (peak) and min (drop) running balance for every month
 * from `today` through `horizon`, inclusive - including months with no
 * transactions, which carry forward the prior month's ending balance.
 */
export function computeMonthlyPeaksAndDrops(
  rows: ForecastRow[],
  startingBalance: number,
  today: string,
  horizon: string,
): MonthlyPeakDrop[] {
  const byMonth = new Map<string, { peak: number; drop: number; end: number }>();

  for (const row of rows) {
    const month = row.dueDate.slice(0, 7);
    const existing = byMonth.get(month);
    if (!existing) {
      byMonth.set(month, { peak: row.runningBalance, drop: row.runningBalance, end: row.runningBalance });
    } else {
      existing.peak = Math.max(existing.peak, row.runningBalance);
      existing.drop = Math.min(existing.drop, row.runningBalance);
      existing.end = row.runningBalance; // rows are chronologically sorted; last write wins
    }
  }

  const results: MonthlyPeakDrop[] = [];
  let carryBalance = startingBalance;
  let [year, month] = today.split("-").map(Number);
  const [endYear, endMonth] = horizon.split("-").map(Number);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const entry = byMonth.get(key);
    if (entry) {
      results.push({ month: key, peak: entry.peak, drop: entry.drop });
      carryBalance = entry.end;
    } else {
      results.push({ month: key, peak: carryBalance, drop: carryBalance });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return results;
}
