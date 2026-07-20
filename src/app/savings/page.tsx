import { createClient } from "@/lib/supabase/server";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createSavings, updateSavings, deleteSavings } from "./actions";

export default async function SavingsPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("recurring_items")
    .select("id, name, amount, day_of_month, start_date, end_date, comments")
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
      amountLabel="Amount (₱ / month)"
      amountColorClass="text-blue-700"
      createAction={createSavings}
      updateAction={updateSavings}
      deleteAction={deleteSavings}
    />
  );
}
