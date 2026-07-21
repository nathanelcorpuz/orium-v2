import type {
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  RecurrenceRule,
  RecurringItem,
} from "./types";
import { expandMonthlyOccurrences } from "./monthly";
import { expandBiweeklyOccurrences, expandWeeklyOccurrences } from "./interval";
import { expandSemiMonthlyOccurrences } from "./semi-monthly";
import { expandRecurrenceOccurrences } from "./recurrence";
import { expandBudgetOccurrences } from "./budgets";

// True once an item has migration 0004's new recurrence columns populated
// (every row in the database today - see SPEC.md T32/T33). Narrows the
// three fields expandRecurrenceOccurrences requires to non-null so it can
// be called directly, rather than the item as a whole (endsType="never"/
// "after_count" items still have a null endDate on purpose).
function hasRecurrenceRule(
  item: RecurringItem,
): item is RecurringItem & Pick<RecurrenceRule, "interval" | "unit" | "endsType"> {
  return item.interval != null && item.unit != null && item.endsType != null;
}

function expandRecurringItem(item: RecurringItem, windowStart: string, windowEnd: string): string[] {
  if (hasRecurrenceRule(item)) {
    const rule: RecurrenceRule = {
      startDate: item.startDate,
      interval: item.interval,
      unit: item.unit,
      weekdays: item.weekdays ?? null,
      daysOfMonth: item.daysOfMonth ?? null,
      endsType: item.endsType,
      endDate: item.endDate,
      occurrenceCount: item.occurrenceCount ?? null,
    };
    return expandRecurrenceOccurrences(rule, windowStart, windowEnd);
  }

  // Legacy path: item hasn't migrated yet (inserted by a pre-T35 form).
  // These forms always set a non-null end_date (see the endDate comment in
  // types.ts); if that invariant is ever violated, treat it as having no
  // occurrences rather than letting date-string comparisons silently
  // misbehave against null.
  if (item.endDate === null) return [];
  const legacyItem = { ...item, endDate: item.endDate };
  switch (item.frequency) {
    case "monthly":
      return expandMonthlyOccurrences(legacyItem, windowStart, windowEnd);
    case "weekly":
      return expandWeeklyOccurrences(legacyItem, windowStart, windowEnd);
    case "biweekly":
      return expandBiweeklyOccurrences(legacyItem, windowStart, windowEnd);
    case "semi_monthly_15_30":
      return expandSemiMonthlyOccurrences(legacyItem, windowStart, windowEnd);
  }
}

function overrideKey(recurringItemId: string, originalDate: string): string {
  return `${recurringItemId}|${originalDate}`;
}

export function generateForecast(input: GenerateForecastInput): ForecastRow[] {
  const { balances, recurringItems, overrides, oneOffs, today, horizon } = input;
  const budgets = input.budgets ?? [];
  const budgetEntries = input.budgetEntries ?? [];

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

  for (const budget of budgets) {
    for (const occurrence of expandBudgetOccurrences(budget, budgetEntries, today, horizon)) {
      rows.push({
        sourceType: "budget",
        sourceId: budget.id,
        originalDate: occurrence.date,
        name: budget.name,
        amount: occurrence.amount,
        dueDate: occurrence.date,
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
