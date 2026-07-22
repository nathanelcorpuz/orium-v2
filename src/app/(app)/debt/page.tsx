import { createClient } from "@/lib/supabase/server";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createDebt, updateDebt, deleteDebt } from "./actions";

export default async function DebtPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("recurring_items")
    .select(
      "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments",
    )
    .eq("type", "debt")
    .order("end_date", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load debt: {error.message}</p>;
  }

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
    />
  );
}
