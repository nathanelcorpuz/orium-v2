import type {
  BudgetOccurrenceOverride,
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  RecurrenceRule,
  RecurringItem,
} from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";
import { expandBudgetCycleOccurrences } from "./budgetCycles";

function toRecurrenceRule(item: RecurringItem): RecurrenceRule {
  return {
    startDate: item.startDate,
    interval: item.interval,
    unit: item.unit,
    weekdays: item.weekdays,
    daysOfMonth: item.daysOfMonth,
    ordinal: item.ordinal,
    ordinalWeekday: item.ordinalWeekday,
    endsType: item.endsType,
    endDate: item.endDate,
    occurrenceCount: item.occurrenceCount,
  };
}

function overrideKey(recurringItemId: string, originalDate: string): string {
  return `${recurringItemId}|${originalDate}`;
}

function budgetOverrideKey(budgetId: string, originalDate: string): string {
  return `${budgetId}|${originalDate}`;
}

export function generateForecast(input: GenerateForecastInput): ForecastRow[] {
  const { balances, recurringItems, overrides, oneOffs, today, horizon } = input;
  const budgets = input.budgets ?? [];
  const budgetEntries = input.budgetEntries ?? [];
  const budgetOverrides = input.budgetOverrides ?? [];

  const overridesByKey = new Map<string, OccurrenceOverride>();
  for (const override of overrides) {
    overridesByKey.set(overrideKey(override.recurringItemId, override.originalDate), override);
  }

  const budgetOverridesByKey = new Map<string, BudgetOccurrenceOverride>();
  for (const override of budgetOverrides) {
    budgetOverridesByKey.set(budgetOverrideKey(override.budgetId, override.originalDate), override);
  }

  const rows: Omit<ForecastRow, "runningBalance">[] = [];

  for (const item of recurringItems) {
    for (const date of expandRecurrenceOccurrences(toRecurrenceRule(item), today, horizon)) {
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

  for (const budget of budgets) {
    for (const occurrence of expandBudgetCycleOccurrences(
      budget,
      budgetEntries,
      recurringItems,
      overrides,
      today,
      horizon,
    )) {
      // Only future boundary rows are editable (SPEC.md T42 part B) - the
      // "remaining this cycle" row is always dated exactly `today` (never
      // `> today`) and has no override concept, so it's never looked up
      // here, matching expandBudgetCycleOccurrences's own row ordering.
      const isFutureRow = occurrence.date > today;
      const override = isFutureRow
        ? budgetOverridesByKey.get(budgetOverrideKey(budget.id, occurrence.date))
        : undefined;
      if (override?.skipped) continue;

      rows.push({
        sourceType: "budget",
        sourceId: budget.id,
        originalDate: occurrence.date,
        name: budget.name,
        amount: override?.newAmount ?? occurrence.amount,
        dueDate: override?.newDate ?? occurrence.date,
        type: "budget",
      });
    }
  }

  // Array.prototype.sort is stable (ES2019+), so equal due dates keep their insertion order.
  rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  let runningBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return rows.map((row) => {
    runningBalance = Math.round(runningBalance + row.amount);
    return { ...row, runningBalance };
  });
}
