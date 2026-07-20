import type {
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  RecurringItem,
} from "./types";
import { expandMonthlyOccurrences } from "./monthly";
import { expandBiweeklyOccurrences, expandWeeklyOccurrences } from "./interval";
import { expandSemiMonthlyOccurrences } from "./semi-monthly";

function expandRecurringItem(item: RecurringItem, windowStart: string, windowEnd: string): string[] {
  switch (item.frequency) {
    case "monthly":
      return expandMonthlyOccurrences(item, windowStart, windowEnd);
    case "weekly":
      return expandWeeklyOccurrences(item, windowStart, windowEnd);
    case "biweekly":
      return expandBiweeklyOccurrences(item, windowStart, windowEnd);
    case "semi_monthly_15_30":
      return expandSemiMonthlyOccurrences(item, windowStart, windowEnd);
  }
}

function overrideKey(recurringItemId: string, originalDate: string): string {
  return `${recurringItemId}|${originalDate}`;
}

export function generateForecast(input: GenerateForecastInput): ForecastRow[] {
  const { balances, recurringItems, overrides, oneOffs, today, horizon } = input;

  const overridesByKey = new Map<string, OccurrenceOverride>();
  for (const override of overrides) {
    overridesByKey.set(overrideKey(override.recurringItemId, override.originalDate), override);
  }

  const rows: Omit<ForecastRow, "runningBalance">[] = [];

  for (const item of recurringItems) {
    for (const date of expandRecurringItem(item, today, horizon)) {
      const override = overridesByKey.get(overrideKey(item.id, date));
      if (override?.skipped) continue;

      rows.push({
        sourceType: "recurring",
        sourceId: item.id,
        originalDate: date,
        name: override?.newName ?? item.name,
        amount: override?.newAmount ?? item.amount,
        dueDate: override?.newDate ?? date,
        type: item.type,
      });
    }
  }

  for (const oneOff of oneOffs) {
    if (oneOff.dueDate < today) continue;

    rows.push({
      sourceType: "one_off",
      sourceId: oneOff.id,
      originalDate: oneOff.dueDate,
      name: oneOff.name,
      amount: oneOff.amount,
      dueDate: oneOff.dueDate,
      type: "extra",
    });
  }

  // Array.prototype.sort is stable (ES2019+), so equal due dates keep their insertion order.
  rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  let runningBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return rows.map((row) => {
    runningBalance = Math.round(runningBalance + row.amount);
    return { ...row, runningBalance };
  });
}
