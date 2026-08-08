import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";
import { addYears, MAX_TRACKING_YEARS } from "@/lib/engine/date-utils";
import { generateForecast } from "@/lib/engine/forecast";
import { toEngineBudget, toEngineEntries, type BudgetEntryRow, type BudgetRow } from "@/lib/budgetView";
import { DEFAULT_TIER_LABELS } from "@/lib/balanceColor";
import type {
  Balance,
  Budget,
  BudgetBalanceLink,
  BudgetEntry,
  BudgetReplenishOverride,
  ForecastRow,
  GenerateForecastInput,
  IncomeAutoMove,
  IncomeAutoMoveManualEntry,
  IncomeAutoMoveOverride,
  OccurrenceOverride,
  OneOffItem,
  RecurringItem,
} from "@/lib/engine/types";

const BUDGET_COLUMNS =
  "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, active, assumed_spend_percent";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];
const DEFAULT_CURRENCY = "₱";

// Lazy loading (user request 2026-08-01): Bills/Income/Debt/Savings only
// ever needed `loadForecast()` for two things - each item's own upcoming/
// paid transactions (now fetched on demand, see itemTransactions.ts) and
// this currency string. Running the whole engine just for a formatting
// string was the bigger waste of the two; this is the same query
// `loadForecast()` already makes, just without everything else around it.
export async function getCurrency(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("preferences").select("currency").single();
  return data?.currency ?? DEFAULT_CURRENCY;
}

// Balance plus `comments`, since the Forecast page reuses the Balances
// page's edit modal (which needs it), unlike the engine's minimal Balance.
// T172: also carries the snake_case `transaction_fee_centavos`, alongside
// `Balance`'s own camelCase `transactionFeeCentavos` - see the mapping
// below for why both are needed on the same object. T284: same for
// `used_for_budgets` alongside `Balance.usedForBudgets`.
export type ForecastBalance = Balance & {
  comments: string | null;
  transaction_fee_centavos?: number;
  used_for_budgets?: boolean;
};

export type ForecastData = {
  forecast: ForecastRow[];
  balances: ForecastBalance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  budgets: Budget[];
  budgetEntries: BudgetEntry[];
  budgetReplenishOverrides: BudgetReplenishOverride[];
  budgetBalanceLinks: BudgetBalanceLink[];
  incomeAutoMoves: IncomeAutoMove[];
  incomeAutoMoveOverrides: IncomeAutoMoveOverride[];
  incomeAutoMoveManualEntries: IncomeAutoMoveManualEntry[];
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
    budgetBalanceLinksRes,
    autoMovesRes,
    autoMoveOverridesRes,
    manualAutoMovesRes,
    preferencesRes,
    activeScenariosRes,
  ] = await Promise.all([
    supabase.from("balances").select("id, name, amount, comments, transaction_fee_centavos, used_for_budgets"),
    supabase
      .from("recurring_items")
      .select(
        "id, name, type, amount, start_date, end_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, occurrence_count, balance_id, comments, active, auto_debited",
      ),
    supabase
      .from("occurrence_overrides")
      .select(
        "id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped, new_balance_id, balance_id_overridden",
      ),
    supabase.from("one_off_items").select("id, name, amount, due_date, balance_id, comments, active"),
    // Bug report (2026-08-08): "every time i drag sliders in the budget
    // usage it changes the order of the list" - this query had no ORDER BY,
    // so Postgres was free to return rows in a different physical order
    // after any UPDATE to the table (exactly what dragging a slider does,
    // via updateBudgetAssumedSpendPercent) - not a client-side bug at all.
    // Matches the Budgets page's own query ordering (budgets/page.tsx) for
    // consistency between the two.
    supabase.from("budgets").select(BUDGET_COLUMNS).order("name", { ascending: true }),
    // Every entry, not just future ones - the Dashboard's budget card
    // needs full history to compute a running total (budgetLedger.ts).
    supabase.from("budget_entries").select("id, budget_id, entry_date, amount, note, direction, balance_id"),
    supabase
      .from("budget_replenish_overrides")
      .select("id, budget_id, original_date, skipped, new_date, new_amount"),
    // T284: every budget's configured account link(s) - drives the
    // forecast's hidden replenish credit leg(s), see forecast.ts.
    supabase.from("budget_budget_accounts").select("budget_id, balance_id, replenish_amount"),
    // T212: every rule, not just ones with active income occurrences ahead -
    // generateForecast itself decides which ones actually produce rows.
    supabase.from("income_auto_moves").select("id, income_id, destination_balance_id, amount"),
    // T224: every per-occurrence edit, same "let the engine decide which
    // ones are still relevant" reasoning as budget_replenish_overrides above.
    supabase
      .from("income_auto_move_overrides")
      .select("id, income_auto_move_id, original_date, skipped, new_date, new_amount"),
    // T243: every one-off manual entry, same "let the engine decide which
    // ones are still relevant" reasoning as the two queries just above -
    // each one only ever matches exactly one occurrence anyway.
    supabase
      .from("income_manual_auto_moves")
      .select("id, income_id, original_date, destination_balance_id, amount"),
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
    budgetBalanceLinksRes.error ??
    autoMovesRes.error ??
    autoMoveOverridesRes.error ??
    manualAutoMovesRes.error;
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
    usedForBudgets: row.used_for_budgets,
    // T284: same dual-field pattern as transaction_fee_centavos above - this
    // exact array also gets threaded straight into BalanceRow[]
    // (ForecastClient.tsx -> BalanceModal.tsx, T152/Bug #12), which reads
    // the snake_case column name.
    used_for_budgets: row.used_for_budgets,
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
      balance_id: row.balance_id,
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

  const budgetBalanceLinks: BudgetBalanceLink[] = (budgetBalanceLinksRes.data ?? []).map((row) => ({
    budgetId: row.budget_id,
    balanceId: row.balance_id,
    replenishAmount: row.replenish_amount,
  }));

  const incomeAutoMoves: IncomeAutoMove[] = (autoMovesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeId: row.income_id,
    destinationBalanceId: row.destination_balance_id,
    amount: row.amount,
  }));

  const incomeAutoMoveOverrides: IncomeAutoMoveOverride[] = (autoMoveOverridesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeAutoMoveId: row.income_auto_move_id,
    originalDate: row.original_date,
    skipped: row.skipped,
    newDate: row.new_date,
    newAmount: row.new_amount,
  }));

  const incomeAutoMoveManualEntries: IncomeAutoMoveManualEntry[] = (manualAutoMovesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeId: row.income_id,
    originalDate: row.original_date,
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
        // T182, full parity added by T218 follow-up (2026-08-02): a
        // scenario budget now carries the same allocation/replenish-source
        // fields a real budget does (migration 0046); real-data linking
        // (linked_income_id, migration 0047) added by T223, same day.
        supabase
          .from("scenario_budgets")
          .select(
            "id, name, created_at, allocation, linked_income_id, linked_scenario_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
          )
          .in("scenario_id", activeScenarioIds),
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

    // T218 follow-up (2026-08-02): a scenario budget now carries its real
    // allocation/replenish source (migration 0046), pushed into the exact
    // same `Budget` shape a real budget uses. T223 (same day): a scenario
    // budget can link to either a *scenario* income (already merged into
    // the same `recurringItems` array above with `fromScenario: true`) or
    // a *real* one (already a real id, present in that array from its own
    // query) - either way `linkedIncomeId` here resolves correctly against
    // `incomeEffectiveOccurrences` (forecast.ts), so BudgetCard-style
    // display (progress bar, "days until replenish") and the Forecast's
    // projected replenish row both work identically regardless of which
    // kind of income it is. This is display/projection-only, same as it is
    // for a real budget (Budgets v3, Phase 10) - the forecast's actual
    // money effect still comes entirely from future-dated entries below
    // (futureBudgetLedgerEntries), never from this schedule alone; linking
    // to a real income does not make settling it write into scenario data
    // (see migration 0047's own comment).
    for (const row of scenarioBudgetsRes.data ?? []) {
      budgets.push({
        id: row.id,
        name: row.name,
        allocation: row.allocation,
        linkedIncomeId: row.linked_income_id ?? row.linked_scenario_income_id,
        createdAt: row.created_at,
        startDate: row.start_date,
        interval: row.interval,
        unit: row.unit,
        weekdays: row.weekdays,
        daysOfMonth: row.days_of_month,
        ordinal: row.ordinal,
        ordinalWeekday: row.ordinal_weekday,
        endsType: row.ends_type,
        endDate: row.end_date,
        occurrenceCount: row.occurrence_count,
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
    budgetBalanceLinks,
    incomeAutoMoves,
    incomeAutoMoveOverrides,
    incomeAutoMoveManualEntries,
    today,
    horizon,
  };

  const forecast = generateForecast(input);

  return {
    forecast,
    balances,
    recurringItems,
    overrides,
    budgets,
    budgetEntries,
    budgetReplenishOverrides,
    budgetBalanceLinks,
    incomeAutoMoves,
    incomeAutoMoveOverrides,
    incomeAutoMoveManualEntries,
    currency: preferencesRes.data?.currency ?? DEFAULT_CURRENCY,
    balanceRanges: preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES,
    tierLabels: preferencesRes.data?.balance_tier_labels ?? DEFAULT_TIER_LABELS,
    sampleDataSeededAt: preferencesRes.data?.sample_data_seeded_at ?? null,
    activeScenarios,
    today,
    horizon,
  };
}
