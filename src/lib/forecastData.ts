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
  IncomeAutoMove,
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
  incomeAutoMoves: IncomeAutoMove[];
  currency: string;
  balanceRanges: number[];
  tierLabels: string[];
  // T97: null once the account has never been auto-seeded or has had its
  // data reset; a real timestamp whenever it currently holds the sample
  // dataset (auto-seeded at signup or brought back via "Restore sample
  // data") - the Dashboard's sample-data banner keys off this.
  sampleDataSeededAt: string | null;
  // T174/T183: empty when no scenario is currently toggled on. When set,
  // `forecast` above already has every one of these scenarios' rows merged
  // in (T183: any number can be active at once, not just one) - this field
  // is only for the UI's own "you are viewing N scenarios" banner/panel,
  // not for deciding whether to merge (that already happened).
  activeScenarios: { id: string; name: string }[];
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
    autoMovesRes,
    preferencesRes,
    activeScenariosRes,
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
    // T212: every rule, not just ones with active income occurrences ahead -
    // generateForecast itself decides which ones actually produce rows.
    supabase.from("income_auto_moves").select("id, income_id, destination_balance_id, amount"),
    supabase
      .from("preferences")
      .select("currency, balance_ranges, balance_tier_labels, sample_data_seeded_at")
      .single(),
    // T183: fetched alongside everything else above rather than after, even
    // though the scenario item queries below still have to wait on this
    // one's result (they need the id list to filter by).
    supabase.from("scenarios").select("id, name").eq("is_active", true),
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
    replenishOverridesRes.error ??
    autoMovesRes.error;
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

  const incomeAutoMoves: IncomeAutoMove[] = (autoMovesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeId: row.income_id,
    destinationBalanceId: row.destination_balance_id,
    amount: row.amount,
  }));

  // T174 ("run possible scenario"), extended by T183 to any number of
  // simultaneously active scenarios: every active scenario's rows are
  // merged into the *same* arrays the engine already consumes - additive to
  // the queries above, not a change to any of them. This is the one
  // integration point for the whole feature: every existing page/action
  // querying `recurring_items`/`one_off_items` directly is completely
  // unaware scenarios exist, since scenario rows live in their own separate
  // tables (`scenario_recurring_items`/`scenario_one_off_items`) and are
  // never returned by those queries. See migration 0033's own comment for
  // why separate tables were chosen over a shared `scenario_id` tag column.
  const activeScenarios = activeScenariosRes.data ?? [];
  const activeScenarioIds = activeScenarios.map((s) => s.id);

  if (activeScenarioIds.length > 0) {
    const [scenarioRecurringRes, scenarioOneOffRes, scenarioBudgetsRes, scenarioBudgetEntriesRes] =
      await Promise.all([
        supabase
          .from("scenario_recurring_items")
          .select(
            "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count, balance_id, comments",
          )
          .in("scenario_id", activeScenarioIds),
        supabase
          .from("scenario_one_off_items")
          .select("id, name, amount, due_date, balance_id, comments")
          .in("scenario_id", activeScenarioIds),
        // T182: budgets in scenarios - see migration 0037's own comment for
        // why this is a plain named "pot" rather than full replenish-
        // schedule/income-link parity with a real budget.
        supabase.from("scenario_budgets").select("id, name, created_at").in("scenario_id", activeScenarioIds),
        supabase
          .from("scenario_budget_entries")
          .select("id, scenario_budget_id, entry_date, amount, note, direction")
          .in("scenario_id", activeScenarioIds),
      ]);

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

    // T182: a scenario budget has no allocation/replenish schedule/linked
    // income of its own (migration 0037's own comment explains why) - it's
    // purely a named pot whose forecast effect comes entirely from its own
    // future-dated entries below, the same way a real *manual* budget's
    // future entries already work (futureBudgetLedgerEntries).
    for (const row of scenarioBudgetsRes.data ?? []) {
      budgets.push({
        id: row.id,
        name: row.name,
        allocation: 0,
        linkedIncomeId: null,
        createdAt: row.created_at,
        startDate: null,
        interval: null,
        unit: null,
        weekdays: null,
        daysOfMonth: null,
        ordinal: null,
        ordinalWeekday: null,
        endsType: null,
        endDate: null,
        occurrenceCount: null,
        fromScenario: true,
      });
    }

    for (const row of scenarioBudgetEntriesRes.data ?? []) {
      budgetEntries.push({
        id: row.id,
        budgetId: row.scenario_budget_id,
        entryDate: row.entry_date,
        amount: row.amount,
        note: row.note,
        direction: row.direction,
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
    incomeAutoMoves,
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
    incomeAutoMoves,
    currency: preferencesRes.data?.currency ?? DEFAULT_CURRENCY,
    balanceRanges: preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES,
    tierLabels: preferencesRes.data?.balance_tier_labels ?? DEFAULT_TIER_LABELS,
    sampleDataSeededAt: preferencesRes.data?.sample_data_seeded_at ?? null,
    activeScenarios,
    today,
    horizon,
  };
}
