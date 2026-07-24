import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createDebt, updateDebt, deleteDebt } from "./actions";

export default async function DebtPage() {
  const supabase = await createClient();
  const [{ data: items, error }, overridesRes] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments",
      )
      .eq("type", "debt")
      .order("end_date", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load debt: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");

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
    />
  );
}
