import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";
import { addYears, MAX_TRACKING_YEARS } from "@/lib/engine/date-utils";
import { generateForecast } from "@/lib/engine/forecast";
import { toEngineBudget, toEngineEntries, type BudgetEntryRow, type BudgetRow } from "@/lib/budgetView";
import { DEFAULT_TIER_LABELS } from "@/lib/balanceColor";
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
  "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, active";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];
const DEFAULT_CURRENCY = "₱";

// Balance plus `comments`, since the Forecast page reuses the Balances
// page's edit modal (which needs it), unlike the engine's minimal Balance.
// T172: also carries the snake_case `transaction_fee_centavos`, alongside
// `Balance`'s own camelCase `transactionFeeCentavos` - see the mapping
// below for why both are needed on the same object.
export type ForecastBalance = Balance & { comments: string | null; transaction_fee_centavos?: number };

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
  tierLabels: string[];
  // T97: null once the account has never been auto-seeded or has had its
  // data reset; a real timestamp whenever it currently holds the sample
  // dataset (auto-seeded at signup or brought back via "Restore sample
  // data") - the Dashboard's sample-data banner keys off this.
  sampleDataSeededAt: string | null;
  // T174: null when no scenario is currently toggled on. When set, `forecast`
  // above already has that scenario's rows merged in - these two fields are
  // only for the UI's own "you are viewing a scenario" banner, not for
  // deciding whether to merge (that already happened).
  activeScenarioId: string | null;
  activeScenarioName: string | null;
  today: string;
  horizon: string;
};

export async function loadForecast(): Promise<ForecastData> {
  const supabase = await createClient();
  const today = todayInManila();
  const horizon = addYears(today, MAX_TRACKING_YEARS);

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
    supabase.from("balances").select("id, name, amount, comments, transaction_fee_centavos"),
    supabase
      .from("recurring_items")
      .select(
        "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count, balance_id, comments, active",
      ),
    supabase
      .from("occurrence_overrides")
      .select("id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped"),
    supabase.from("one_off_items").select("id, name, amount, due_date, balance_id, comments, active"),
    supabase.from("budgets").select(BUDGET_COLUMNS),
    // Every entry, not just future ones - the Dashboard's budget card
    // needs full history to compute a running total (budgetLedger.ts).
    supabase.from("budget_entries").select("id, budget_id, entry_date, amount, note, direction"),
    supabase
      .from("budget_replenish_overrides")
      .select("id, budget_id, original_date, skipped, new_date, new_amount"),
    supabase
      .from("preferences")
      .select("currency, balance_ranges, balance_tier_labels, sample_data_seeded_at, active_scenario_id")
      .single(),
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

  // T172: only place this row shape gets translated from snake_case - it
  // used to be a direct passthrough since id/name/amount/comments all
  // happened to already match; transaction_fee_centavos breaks that
  // coincidence, so this is now an explicit mapping like every other table.
  //
  // Carries both the camelCase field (transactionFeeCentavos, what the
  // engine's Balance type reads) and the snake_case one
  // (transaction_fee_centavos, what BalanceModal.tsx's BalanceRow expects) -
  // this exact array is used both as GenerateForecastInput.balances below
  // and as ForecastData.balances, which ForecastClient.tsx threads straight
  // into BalanceRow[]. One object satisfying both shapes is simpler than
  // maintaining two separate arrays for the same rows.
  const balances: ForecastBalance[] = (balancesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    comments: row.comments,
    transactionFeeCentavos: row.transaction_fee_centavos,
    transaction_fee_centavos: row.transaction_fee_centavos,
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
    comments: row.comments,
    active: row.active,
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
    balanceId: row.balance_id,
    comments: row.comments,
    active: row.active,
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
    // T168 (migration 0027)
    newDate: row.new_date,
    newAmount: row.new_amount,
  }));

  // T174 ("run possible scenario"): if the user has an active scenario, its
  // rows are merged into the *same* arrays the engine already consumes -
  // additive to the queries above, not a change to any of them. This is the
  // one integration point for the whole feature: every existing page/action
  // querying `recurring_items`/`one_off_items` directly is completely
  // unaware scenarios exist, since scenario rows live in their own separate
  // tables (`scenario_recurring_items`/`scenario_one_off_items`) and are
  // never returned by those queries. See migration 0033's own comment for
  // why separate tables were chosen over a shared `scenario_id` tag column.
  const activeScenarioId = preferencesRes.data?.active_scenario_id ?? null;
  let activeScenarioName: string | null = null;

  if (activeScenarioId) {
    const [scenarioRes, scenarioRecurringRes, scenarioOneOffRes] = await Promise.all([
      supabase.from("scenarios").select("name").eq("id", activeScenarioId).single(),
      supabase
        .from("scenario_recurring_items")
        .select(
          "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count, balance_id, comments",
        )
        .eq("scenario_id", activeScenarioId),
      supabase
        .from("scenario_one_off_items")
        .select("id, name, amount, due_date, balance_id, comments")
        .eq("scenario_id", activeScenarioId),
    ]);

    // A scenario that no longer exists (e.g. deleted from another tab in
    // the same moment) just means scenario mode silently has nothing to
    // add this render - not a page-breaking error, since the preference FK
    // is ON DELETE SET NULL and will catch up on the next load anyway.
    activeScenarioName = scenarioRes.data?.name ?? null;

    for (const row of scenarioRecurringRes.data ?? []) {
      recurringItems.push({
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
        comments: row.comments,
        fromScenario: true,
      });
    }

    for (const row of scenarioOneOffRes.data ?? []) {
      oneOffs.push({
        id: row.id,
        name: row.name,
        amount: row.amount,
        dueDate: row.due_date,
        balanceId: row.balance_id,
        comments: row.comments,
        fromScenario: true,
      });
    }
  }

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
    tierLabels: preferencesRes.data?.balance_tier_labels ?? DEFAULT_TIER_LABELS,
    sampleDataSeededAt: preferencesRes.data?.sample_data_seeded_at ?? null,
    activeScenarioId,
    activeScenarioName,
    today,
    horizon,
  };
}
