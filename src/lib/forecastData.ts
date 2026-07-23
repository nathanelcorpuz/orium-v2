import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";
import { formatDate } from "@/lib/engine/date-utils";
import { generateForecast } from "@/lib/engine/forecast";
import { toEngineBudget, toEngineEntries, type BudgetEntryRow, type BudgetRow } from "@/lib/budgetView";
import type {
  Balance,
  Budget,
  BudgetEntry,
  BudgetReplenishOverride,
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  OneOffItem,
  RecurringItem,
} from "@/lib/engine/types";

const BUDGET_COLUMNS =
  "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];
const DEFAULT_CURRENCY = "₱";

// Balance plus `comments`, since the Forecast page reuses the Balances
// page's edit modal (which needs it), unlike the engine's minimal Balance.
export type ForecastBalance = Balance & { comments: string | null };

function addYears(dateStr: string, years: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export type ForecastData = {
  forecast: ForecastRow[];
  balances: ForecastBalance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  budgets: Budget[];
  budgetEntries: BudgetEntry[];
  budgetReplenishOverrides: BudgetReplenishOverride[];
  currency: string;
  balanceRanges: number[];
  today: string;
  horizon: string;
};

export async function loadForecast(): Promise<ForecastData> {
  const supabase = await createClient();
  const today = todayInManila();
  const horizon = addYears(today, 3);

  const [
    balancesRes,
    recurringRes,
    overridesRes,
    oneOffsRes,
    budgetsRes,
    entriesRes,
    replenishOverridesRes,
    preferencesRes,
  ] = await Promise.all([
    supabase.from("balances").select("id, name, amount, comments"),
    supabase
      .from("recurring_items")
      .select(
        "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count",
      ),
    supabase
      .from("occurrence_overrides")
      .select("id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped"),
    supabase.from("one_off_items").select("id, name, amount, due_date"),
    supabase.from("budgets").select(BUDGET_COLUMNS),
    // Every entry, not just future ones - the Dashboard's budget card
    // needs full history to compute a running total (budgetLedger.ts).
    supabase.from("budget_entries").select("id, budget_id, entry_date, amount, note, direction"),
    supabase.from("budget_replenish_overrides").select("id, budget_id, original_date, skipped"),
    supabase.from("preferences").select("currency, balance_ranges").single(),
  ]);

  // These queries determine the forecast's correctness - silently treating a
  // failed one as empty would show a wrong forecast with no indication
  // anything failed. Preferences failure is left as a graceful fallback
  // below (formatting only).
  const criticalError =
    balancesRes.error ??
    recurringRes.error ??
    overridesRes.error ??
    oneOffsRes.error ??
    budgetsRes.error ??
    entriesRes.error ??
    replenishOverridesRes.error;
  if (criticalError) {
    throw new Error(`Failed to load forecast data: ${criticalError.message}`);
  }

  const balances: ForecastBalance[] = balancesRes.data ?? [];

  const recurringItems: RecurringItem[] = (recurringRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    amount: row.amount,
    startDate: row.start_date,
    endDate: row.end_date,
    interval: row.interval,
    unit: row.unit,
    weekdays: row.weekdays,
    daysOfMonth: row.days_of_month,
    ordinal: row.ordinal,
    ordinalWeekday: row.ordinal_weekday,
    endsType: row.ends_type,
    occurrenceCount: row.occurrence_count,
  }));

  const overrides: OccurrenceOverride[] = (overridesRes.data ?? []).map((row) => ({
    id: row.id,
    recurringItemId: row.recurring_item_id,
    originalDate: row.original_date,
    newDate: row.new_date,
    newAmount: row.new_amount,
    newName: row.new_name,
    skipped: row.skipped,
  }));

  const oneOffs: OneOffItem[] = (oneOffsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    dueDate: row.due_date,
  }));

  const budgetRows: BudgetRow[] = budgetsRes.data ?? [];
  const budgets: Budget[] = budgetRows.map(toEngineBudget);

  const entriesByBudgetId = new Map<string, BudgetEntryRow[]>();
  for (const row of entriesRes.data ?? []) {
    const list = entriesByBudgetId.get(row.budget_id) ?? [];
    list.push({
      id: row.id,
      entry_date: row.entry_date,
      amount: row.amount,
      note: row.note,
      direction: row.direction,
    });
    entriesByBudgetId.set(row.budget_id, list);
  }
  const budgetEntries: BudgetEntry[] = budgetRows.flatMap((budget) =>
    toEngineEntries(entriesByBudgetId.get(budget.id) ?? [], budget.id),
  );

  const budgetReplenishOverrides: BudgetReplenishOverride[] = (replenishOverridesRes.data ?? []).map((row) => ({
    id: row.id,
    budgetId: row.budget_id,
    originalDate: row.original_date,
    skipped: row.skipped,
  }));

  const input: GenerateForecastInput = {
    balances,
    recurringItems,
    overrides,
    oneOffs,
    budgets,
    budgetEntries,
    budgetReplenishOverrides,
    today,
    horizon,
  };

  return {
    forecast: generateForecast(input),
    balances,
    recurringItems,
    overrides,
    budgets,
    budgetEntries,
    budgetReplenishOverrides,
    currency: preferencesRes.data?.currency ?? DEFAULT_CURRENCY,
    balanceRanges: preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES,
    today,
    horizon,
  };
}
