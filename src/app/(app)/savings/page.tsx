import { createClient } from "@/lib/supabase/server";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createSavings, updateSavings, deleteSavings } from "./actions";

export default async function SavingsPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("recurring_items")
    .select(
      "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments",
    )
    .eq("type", "savings")
    .order("end_date", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load savings: {error.message}</p>;
  }

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
    />
  );
}
