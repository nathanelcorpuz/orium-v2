import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { groupBy } from "@/lib/groupBy";
import { loadForecast } from "@/lib/forecastData";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createDebt, updateDebt, deleteDebt } from "./actions";

export default async function DebtPage() {
  const supabase = await createClient();
  const [{ data: items, error }, overridesRes, balancesRes, settlementsRes, { forecast, currency }] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id, active",
      )
      .eq("type", "debt")
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
      .eq("type", "debt")
      .order("actual_date", { ascending: false }),
    // Reused for each item's "Upcoming" view - already override-aware, so
    // no separate expansion logic is needed here.
    loadForecast(),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load debt: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");
  const upcomingByItemId = groupBy(
    // T150 (Bug #11): the forecast now opens with any unsettled past-due
    // backlog. This list is specifically "what is coming up" for each item -
    // a missed payment from months ago showing as the next one would read as
    // a bug - so past-due rows are filtered out here deliberately, keeping
    // this page exactly as it was. Surfacing overdue goals here is a
    // reasonable follow-up, but it is a product decision, not part of
    // this fix.
    forecast.filter((row) => row.sourceType === "recurring" && row.type === "debt" && !row.pastDue),
    (row) => row.sourceId,
  );
  const paidByItemId = groupBy(settlementsRes.data ?? [], (row) => row.source_id);

  return (
    <MonthlyGoalsClient
      items={items ?? []}
      pageTitle="Debt"
      noun="debt"
      amountLabel="Amount (₱)"
      amountColorClass="text-orange-700"
      createAction={createDebt}
      updateAction={updateDebt}
      deleteAction={deleteDebt}
      editedIds={editedIds}
      balances={balancesRes.data ?? []}
      upcomingByItemId={upcomingByItemId}
      paidByItemId={paidByItemId}
      currency={currency}
    />
  );
}
