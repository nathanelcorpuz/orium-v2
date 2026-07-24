import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createSavings, updateSavings, deleteSavings } from "./actions";

export default async function SavingsPage() {
  const supabase = await createClient();
  const [{ data: items, error }, overridesRes] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments",
      )
      .eq("type", "savings")
      .order("end_date", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
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
      amountLabel="Amount (₱)"
      amountColorClass="text-blue-700"
      createAction={createSavings}
      updateAction={updateSavings}
      deleteAction={deleteSavings}
      editedIds={editedIds}
    />
  );
}
