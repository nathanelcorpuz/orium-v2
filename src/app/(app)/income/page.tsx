import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { groupBy } from "@/lib/groupBy";
import { getCurrency } from "@/lib/forecastData";
import { IncomeClient } from "./IncomeClient";

export default async function IncomePage() {
  const supabase = await createClient();
  // Lazy loading (user request 2026-08-01): each income's own upcoming/paid
  // transactions moved to an on-demand fetch (itemTransactions.ts), fired
  // only when a specific income's "view transactions" modal actually opens.
  const [
    { data: incomes, error },
    overridesRes,
    balancesRes,
    budgetsRes,
    autoMovesRes,
    autoMoveOverridesRes,
    manualAutoMovesRes,
    currency,
  ] = await Promise.all([
      supabase
        .from("recurring_items")
        .select(
          "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id, active",
        )
        .eq("type", "income")
        .order("name", { ascending: true }),
      // T51: any occurrence_overrides row (including a pure skip) marks the
      // item itself as edited, not just its individual Forecast occurrences.
      supabase.from("occurrence_overrides").select("recurring_item_id"),
      // T71: options for the optional "connected account" dropdown.
      supabase.from("balances").select("id, name").order("name", { ascending: true }),
      // T71 follow-up: which budgets replenish from each income, for display.
      // T245: `allocation` added so the page can show how much of the
      // income each linked budget actually takes, not just its name.
      supabase
        .from("budgets")
        .select("id, name, linked_income_id, allocation")
        .not("linked_income_id", "is", null),
      // T212: every income's auto-move rules, for both display (the "Auto-
      // moves: X" pill) and prefilling IncomeModal's edit form.
      supabase.from("income_auto_moves").select("id, income_id, destination_balance_id, amount"),
      // T224: per-occurrence edits, so the "Upcoming" modal's EditSettleModal
      // (via ItemTransactionsModal) can resolve the same effective
      // amount/skip state the Forecast page itself shows for a given date.
      supabase
        .from("income_auto_move_overrides")
        .select("id, income_auto_move_id, original_date, skipped, new_date, new_amount"),
      // T243: every one-off manual entry, for the same "Upcoming" modal
      // resolution ForecastData.ts/generateForecast already does.
      supabase
        .from("income_manual_auto_moves")
        .select("id, income_id, original_date, destination_balance_id, amount"),
      getCurrency(),
    ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load income: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");
  const autoMovesByIncomeId = groupBy(autoMovesRes.data ?? [], (row) => row.income_id);
  const incomeAutoMoveOverrides = (autoMoveOverridesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeAutoMoveId: row.income_auto_move_id,
    originalDate: row.original_date,
    skipped: row.skipped,
    newDate: row.new_date,
    newAmount: row.new_amount,
  }));
  const incomeAutoMoveManualEntries = (manualAutoMovesRes.data ?? []).map((row) => ({
    id: row.id,
    incomeId: row.income_id,
    originalDate: row.original_date,
    destinationBalanceId: row.destination_balance_id,
    amount: row.amount,
  }));

  return (
    <IncomeClient
      incomes={incomes ?? []}
      editedIds={editedIds}
      balances={balancesRes.data ?? []}
      linkedBudgets={budgetsRes.data ?? []}
      autoMovesByIncomeId={autoMovesByIncomeId}
      incomeAutoMoveOverrides={incomeAutoMoveOverrides}
      incomeAutoMoveManualEntries={incomeAutoMoveManualEntries}
      currency={currency}
    />
  );
}
