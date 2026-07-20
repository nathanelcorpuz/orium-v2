import { createClient } from "@/lib/supabase/server";
import { BillsClient } from "./BillsClient";

export default async function BillsPage() {
  const supabase = await createClient();
  const { data: bills, error } = await supabase
    .from("recurring_items")
    .select("id, name, amount, day_of_month, end_date, comments")
    .eq("type", "bill")
    .order("day_of_month", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load bills: {error.message}</p>;
  }

  return <BillsClient bills={bills ?? []} />;
}
