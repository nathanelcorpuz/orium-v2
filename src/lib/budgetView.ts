import type {
  Budget,
  BudgetEntry,
  OccurrenceOverride,
  RecurrenceEndsType,
  RecurrenceUnit,
  RecurringItem,
} from "./engine/types";
import type { BudgetScheduleSource } from "./engine/budgetCycles";
import { summarizeRecurrence } from "./recurrenceSummary";

// Shared display plumbing for budgets v2 (SPEC.md T38/T39), used by both the
// Budgets page (BudgetCard.tsx) and the Forecast sidebar panel
// (BudgetsPanel.tsx) - both need the same snake_case-DB-row -> engine-type
// conversion and the same "what does this budget's schedule read as"
// description, so it lives here once instead of twice.

export type BudgetRow = {
  id: string;
  name: string;
  monthly_allocation: number;
  allocation: number;
  carryover_enabled: boolean;
  created_at: string;
  linked_income_id: string | null;
  start_date: string | null;
  interval: number | null;
  unit: RecurrenceUnit | null;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: RecurrenceEndsType | null;
  end_date: string | null;
  occurrence_count: number | null;
};

export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
};

export type IncomeItemRow = {
  id: string;
  name: string;
  type: "income";
  amount: number;
  start_date: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: RecurrenceEndsType;
  end_date: string | null;
  occurrence_count: number | null;
};

export type OverrideRow = {
  id: string;
  recurring_item_id: string;
  original_date: string;
  new_date: string | null;
  new_amount: number | null;
  new_name: string | null;
  skipped: boolean;
};

export function toEngineBudget(budget: BudgetRow): Budget {
  return {
    id: budget.id,
    name: budget.name,
    monthlyAllocation: budget.monthly_allocation,
    allocation: budget.allocation,
    carryoverEnabled: budget.carryover_enabled,
    createdAt: budget.created_at.slice(0, 10),
    linkedIncomeId: budget.linked_income_id,
    startDate: budget.start_date,
    interval: budget.interval,
    unit: budget.unit,
    weekdays: budget.weekdays,
    daysOfMonth: budget.days_of_month,
    ordinal: budget.ordinal,
    ordinalWeekday: budget.ordinal_weekday,
    endsType: budget.ends_type,
    endDate: budget.end_date,
    occurrenceCount: budget.occurrence_count,
  };
}

export function toEngineIncomes(incomes: IncomeItemRow[]): RecurringItem[] {
  return incomes.map((income) => ({
    id: income.id,
    name: income.name,
    type: income.type,
    amount: income.amount,
    startDate: income.start_date,
    interval: income.interval,
    unit: income.unit,
    weekdays: income.weekdays,
    daysOfMonth: income.days_of_month,
    ordinal: income.ordinal,
    ordinalWeekday: income.ordinal_weekday,
    endsType: income.ends_type,
    endDate: income.end_date,
    occurrenceCount: income.occurrence_count,
  }));
}

export function toEngineOverrides(overrides: OverrideRow[]): OccurrenceOverride[] {
  return overrides.map((o) => ({
    id: o.id,
    recurringItemId: o.recurring_item_id,
    originalDate: o.original_date,
    newDate: o.new_date,
    newAmount: o.new_amount,
    newName: o.new_name,
    skipped: o.skipped,
  }));
}

export function toEngineEntries(entries: BudgetEntryRow[], budgetId: string): BudgetEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    budgetId,
    entryDate: entry.entry_date,
    amount: entry.amount,
    note: entry.note,
  }));
}

// "Resets ..." display text (SPEC.md T38/T39) for a budget's schedule
// source. Takes the engine-shaped Budget (not the raw DB row) since
// forecastData.ts already has budgets in that shape for generateForecast -
// BudgetCard.tsx converts via toEngineBudget() first.
export function scheduleDescription(
  source: BudgetScheduleSource,
  budget: Budget,
  incomeNameById: Map<string, string>,
): string {
  if (source === "linked_income") {
    const name = budget.linkedIncomeId ? incomeNameById.get(budget.linkedIncomeId) : undefined;
    return name ? `Resets with ${name}` : "Resets with linked income";
  }
  if (source === "own_schedule" && budget.unit && budget.interval && budget.startDate && budget.endsType) {
    const summary = summarizeRecurrence({
      startDate: budget.startDate,
      interval: budget.interval,
      unit: budget.unit,
      weekdays: budget.weekdays,
      daysOfMonth: budget.daysOfMonth,
      ordinal: budget.ordinal,
      ordinalWeekday: budget.ordinalWeekday,
      endsType: budget.endsType,
      endDate: budget.endDate,
      occurrenceCount: budget.occurrenceCount,
    });
    return `Resets ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
  }
  return "Resets monthly on the 1st";
}
