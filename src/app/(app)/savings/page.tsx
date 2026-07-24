import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { groupBy } from "@/lib/groupBy";
import { loadForecast } from "@/lib/forecastData";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createSavings, updateSavings, deleteSavings } from "./actions";

export default async function SavingsPage() {
  const supabase = await createClient();
  const [{ data: items, error }, overridesRes, balancesRes, settlementsRes, { forecast }] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id",
      )
      .eq("type", "savings")
      .order("end_date", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
    // T71: options for the optional "connected account" dropdown.
    supabase.from("balances").select("id, name").order("name", { ascending: true }),
    // User request 2026-07-24: settled transactions for each item's
    // "Paid" view.
    supabase
      .from("settlements")
      .select("id, source_id, name, forecasted_amount, actual_amount, forecasted_date, actual_date")
      .eq("type", "savings")
      .order("actual_date", { ascending: false }),
    // Reused for each item's "Upcoming" view - already override-aware, so
    // no separate expansion logic is needed here.
    loadForecast(),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load savings: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");
  const upcomingByItemId = groupBy(
    forecast.filter((row) => row.sourceType === "recurring" && row.type === "savings"),
    (row) => row.sourceId,
  );
  const paidByItemId = groupBy(settlementsRes.data ?? [], (row) => row.source_id);

  return (
    <MonthlyGoalsClient
      items={items ?? []}
      pageTitle="Savings"
      noun="savings goal"
      amountLabel="Amount (₱)"
      amountColorClass="text-blue-700"
      createAction={createSavings}
      updateAction={updateSavings}
      deleteAction={deleteSavings}
      editedIds={editedIds}
      balances={balancesRes.data ?? []}
      upcomingByItemId={upcomingByItemId}
      paidByItemId={paidByItemId}
    />
  );
}
