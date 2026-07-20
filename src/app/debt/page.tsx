import { createClient } from "@/lib/supabase/server";
import { MonthlyGoalsClient } from "@/components/recurring/MonthlyGoalsClient";
import { createDebt, updateDebt, deleteDebt } from "./actions";

export default async function DebtPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("recurring_items")
    .select("id, name, amount, day_of_month, start_date, end_date, comments")
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
      amountLabel="Amount (₱ / month)"
      amountColorClass="text-orange-700"
      createAction={createDebt}
      updateAction={updateDebt}
      deleteAction={deleteDebt}
    />
  );
}
