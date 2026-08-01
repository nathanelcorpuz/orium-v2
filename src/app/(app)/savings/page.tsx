import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { getCurrency } from "@/lib/forecastData";
import { getSettlementCountsByItemId } from "@/lib/itemTransactions";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createSavings, updateSavings, deleteSavings } from "./actions";

export default async function SavingsPage() {
  const supabase = await createClient();
  // Lazy loading (user request 2026-08-01): each savings item's own
  // upcoming/paid transaction detail moved to an on-demand fetch
  // (itemTransactions.ts), fired only when a specific item's "view
  // transactions" modal actually opens. `paidCounts` stays eager - the
  // active/completed split and progress bar below need it on every render,
  // but it's just a count, far lighter than the old full settlement-row
  // fetch.
  const [{ data: items, error }, overridesRes, balancesRes, paidCounts, currency] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id, active",
      )
      .eq("type", "savings")
      .order("end_date", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
    // T71: options for the optional "connected account" dropdown.
    supabase.from("balances").select("id, name").order("name", { ascending: true }),
    getSettlementCountsByItemId("savings"),
    getCurrency(),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load savings: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");

  return (
    <MonthlyGoalsClient
      items={items ?? []}
      pageTitle="Savings"
      noun="savings goal"
      itemType="savings"
      amountLabel="Amount (₱)"
      amountColorClass="text-blue-700"
      createAction={createSavings}
      updateAction={updateSavings}
      deleteAction={deleteSavings}
      editedIds={editedIds}
      balances={balancesRes.data ?? []}
      paidCountByItemId={paidCounts}
      currency={currency}
    />
  );
}
