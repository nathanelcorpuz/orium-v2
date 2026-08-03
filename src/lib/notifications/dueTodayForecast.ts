import type { SupabaseClient } from "@supabase/supabase-js";
import { generateForecast } from "@/lib/engine/forecast";
import { addYears, MAX_TRACKING_YEARS } from "@/lib/engine/date-utils";
import type {
  Balance,
  Budget,
  BudgetEntry,
  BudgetReplenishOverride,
  GenerateForecastInput,
  IncomeAutoMove,
  IncomeAutoMoveOverride,
  OccurrenceOverride,
  OneOffItem,
  RecurringItem,
} from "@/lib/engine/types";
import { toEngineBudget, toEngineEntries, type BudgetEntryRow, type BudgetRow } from "@/lib/budgetView";

const BUDGET_COLUMNS =
  "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, active";

export type DueTodayItem = {
  name: string;
  amount: number; // centavos, signed
  type: string;
};

// Daily due-today email notification (user request 2026-08-03). Deliberately
// a separate, smaller loader rather than reusing `forecastData.ts`'s
// `loadForecast()`:
//
// 1. This runs from a cron route with no signed-in session (see
//    src/app/api/cron/daily-notifications/route.ts) - it's handed a
//    service-role client and an explicit `userId`, and every query below is
//    scoped by `.eq("user_id", userId)` by hand, since a service-role client
//    bypasses RLS entirely (the thing that normally does this scoping for
//    every other caller of `loadForecast()`). Getting this wrong would leak
//    one user's forecast into another's email.
// 2. Scenarios are deliberately excluded - a "what-if" is hypothetical by
//    definition (SPEC.md), and a notification email listing a scenario's
//    invented transactions as if they were real would be actively
//    misleading, unlike the Forecast/Dashboard UI where they're always
//    clearly tinted and bannered as hypothetical.
export async function loadDueTodayItems(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<DueTodayItem[]> {
  const [balancesRes, recurringRes, overridesRes, oneOffsRes, budgetsRes, entriesRes, replenishOverridesRes] =
    await Promise.all([
      supabase.from("balances").select("id, name, amount, transaction_fee_centavos").eq("user_id", userId),
      supabase
        .from("recurring_items")
        .select(
          "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count, balance_id, active, auto_debited",
        )
        .eq("user_id", userId),
      supabase
        .from("occurrence_overrides")
        .select(
          "id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped, new_balance_id, balance_id_overridden",
        )
        .eq("user_id", userId),
      supabase.from("one_off_items").select("id, name, amount, due_date, balance_id, active").eq("user_id", userId),
      supabase.from("budgets").select(BUDGET_COLUMNS).eq("user_id", userId),
      supabase.from("budget_entries").select("id, budget_id, entry_date, amount, note, direction").eq("user_id", userId),
      supabase
        .from("budget_replenish_overrides")
        .select("id, budget_id, original_date, skipped, new_date, new_amount")
        .eq("user_id", userId),
    ]);

  const balances: Balance[] = (balancesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    transactionFeeCentavos: row.transaction_fee_centavos,
  }));

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
    balanceId: row.balance_id,
    active: row.active,
    autoDebited: row.auto_debited,
  }));

  const overrides: OccurrenceOverride[] = (overridesRes.data ?? []).map((row) => ({
    id: row.id,
    recurringItemId: row.recurring_item_id,
    originalDate: row.original_date,
    newDate: row.new_date,
    newAmount: row.new_amount,
    newName: row.new_name,
    skipped: row.skipped,
    newBalanceId: row.new_balance_id,
    balanceIdOverridden: row.balance_id_overridden,
  }));

  const oneOffs: OneOffItem[] = (oneOffsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    dueDate: row.due_date,
    balanceId: row.balance_id,
    active: row.active,
  }));

  const budgetRows: BudgetRow[] = budgetsRes.data ?? [];
  const budgets: Budget[] = budgetRows.map(toEngineBudget);

  const entriesByBudgetId = new Map<string, BudgetEntryRow[]>();
  for (const row of entriesRes.data ?? []) {
    const list = entriesByBudgetId.get(row.budget_id) ?? [];
    list.push({ id: row.id, entry_date: row.entry_date, amount: row.amount, note: row.note, direction: row.direction });
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
    newDate: row.new_date,
    newAmount: row.new_amount,
  }));

  // No income auto-moves in this list - they're transfer legs between the
  // user's own accounts (T212), not a payable someone needs to be alerted
  // about the way a bill/income/debt/savings/misc item is.
  const incomeAutoMoves: IncomeAutoMove[] = [];
  const incomeAutoMoveOverrides: IncomeAutoMoveOverride[] = [];

  // Full horizon, same as the real Forecast page (forecastData.ts) - not
  // just "up to today". A rule's *original* occurrence date is what bounds
  // expansion, before any override is applied; a future occurrence the user
  // dragged to today via an edit override would otherwise never even be
  // generated, so the digest would silently miss it. This runs in the
  // background with no page-load latency to protect, so the extra expansion
  // cost doesn't matter the way it would on a live request.
  const input: GenerateForecastInput = {
    balances,
    recurringItems,
    overrides,
    oneOffs,
    budgets,
    budgetEntries,
    budgetReplenishOverrides,
    incomeAutoMoves,
    incomeAutoMoveOverrides,
    today,
    horizon: addYears(today, MAX_TRACKING_YEARS),
  };

  return generateForecast(input)
    .filter((row) => !row.hidden && !row.pastDue && row.dueDate === today)
    .map((row) => ({ name: row.name, amount: row.amount, type: row.type }));
}
