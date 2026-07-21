import { createClient } from "@/lib/supabase/server";
import { BillsClient } from "./BillsClient";

export default async function BillsPage() {
  const supabase = await createClient();
  const { data: bills, error } = await supabase
    .from("recurring_items")
    .select(
      "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments",
    )
    .eq("type", "bill")
    .order("start_date", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load bills: {error.message}</p>;
  }

  return <BillsClient bills={bills ?? []} />;
}
