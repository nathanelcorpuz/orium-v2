import { createClient } from "@/lib/supabase/server";
import { IncomeClient } from "./IncomeClient";

export default async function IncomePage() {
  const supabase = await createClient();
  const { data: incomes, error } = await supabase
    .from("recurring_items")
    .select("id, name, amount, frequency, day_of_month, start_date, end_date, comments")
    .eq("type", "income")
    .order("name", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load income: {error.message}</p>;
  }

  return <IncomeClient incomes={incomes ?? []} />;
}
